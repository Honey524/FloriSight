#!/bin/bash

# Ensure the script is run with sudo/root privileges
if [ "$EUID" -ne 0 ]; then
  echo "Error: Please run this script with sudo:"
  echo "  sudo bash $0"
  exit 1
fi

echo "=== 1. Finding Local IP Address ==="
# Get the primary local IP address (excluding loopback and docker interfaces)
IP_ADDR=$(hostname -I | awk '{print $1}')
if [ -z "$IP_ADDR" ]; then
  echo "Could not auto-detect local IP address. Please check your network connection."
  exit 1
fi
echo "Your laptop's local IP address is: $IP_ADDR"

echo "=== 2. Configuring PostgreSQL to Accept Network Connections ==="
# Find PostgreSQL configuration directories
PG_CONF_DIRS=( /etc/postgresql/*/main )

if [ ! -d "${PG_CONF_DIRS[0]}" ]; then
  echo "Error: Could not find PostgreSQL main configuration directory at /etc/postgresql/*/main"
  exit 1
fi

for CONF_DIR in "${PG_CONF_DIRS[@]}"; do
  echo "Found PostgreSQL configuration directory: $CONF_DIR"
  
  POSTGRESQL_CONF="$CONF_DIR/postgresql.conf"
  PG_HBA_CONF="$CONF_DIR/pg_hba.conf"

  # Modify postgresql.conf to listen on all interfaces '*'
  if grep -qE "^\s*listen_addresses\s*=\s*'\*'" "$POSTGRESQL_CONF"; then
    echo "  - postgresql.conf is already configured to listen on '*'"
  else
    # Check if there is an uncommented listen_addresses line
    if grep -qE "^\s*listen_addresses" "$POSTGRESQL_CONF"; then
      # Replace existing uncommented line
      sed -i "s/^\s*listen_addresses\s*=\s*.*/listen_addresses = '*'/" "$POSTGRESQL_CONF"
    else
      # Replace commented line or append to the end
      if grep -qE "#\s*listen_addresses\s*=\s*'localhost'" "$POSTGRESQL_CONF"; then
        sed -i "s/#\s*listen_addresses\s*=\s*'localhost'/listen_addresses = '*'/" "$POSTGRESQL_CONF"
      else
        echo "listen_addresses = '*'" >> "$POSTGRESQL_CONF"
      fi
    fi
    echo "  - Updated postgresql.conf to listen_addresses = '*'"
  fi

  echo "=== 3. Allowing Client IPs ==="
  # Compute local subnet (e.g. 192.168.1.0/24)
  SUBNET=$(echo "$IP_ADDR" | cut -d. -f1-3).0/24
  echo "Inferred local network subnet: $SUBNET"

  # Add connection rules for both scram-sha-256 (default in newer versions) and md5 (older versions)
  RULE_EXISTS_SUBNET=$(grep -F "$SUBNET" "$PG_HBA_CONF")
  
  if [ -n "$RULE_EXISTS_SUBNET" ]; then
    echo "  - Rules for subnet $SUBNET already exist in pg_hba.conf:"
    echo "$RULE_EXISTS_SUBNET"
  else
    echo "" >> "$PG_HBA_CONF"
    echo "# Allow remote connections from local Wi-Fi/LAN network ($SUBNET)" >> "$PG_HBA_CONF"
    echo "host    all             all             $SUBNET                 scram-sha-256" >> "$PG_HBA_CONF"
    echo "host    all             all             $SUBNET                 md5" >> "$PG_HBA_CONF"
    echo "  - Added remote access rules for subnet $SUBNET to pg_hba.conf"
  fi
done

echo "=== 4. Restarting PostgreSQL ==="
if systemctl restart postgresql 2>/dev/null; then
  echo "PostgreSQL service restarted successfully."
elif systemctl restart postgresql@16-main 2>/dev/null; then
  echo "PostgreSQL service (postgresql@16-main) restarted successfully."
else
  echo "Warning: Could not restart PostgreSQL service via systemctl. Please restart it manually."
fi

echo "=== 5. Opening Firewall Port (5432) ==="
if command -v ufw >/dev/null 2>&1; then
  if ufw status | grep -q "Status: active"; then
    ufw allow 5432/tcp
    echo "Firewall rule added: allowed incoming TCP on port 5432 (PostgreSQL)."
  else
    echo "Firewall (UFW) is installed but not active. Skipped."
  fi
else
  echo "UFW firewall command not found. If you use a different firewall (like firewalld or iptables), ensure port 5432/tcp is open."
fi

echo "=== Done! ==="
echo "Other systems on your Wi-Fi/LAN network can now connect to PostgreSQL using:"
echo "  Host: $IP_ADDR"
echo "  Port: 5432"
