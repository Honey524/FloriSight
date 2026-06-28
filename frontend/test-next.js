const http = require('http');

const data = JSON.stringify({
  amount: 500,
  workerId: "test-worker"
});

const options = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/payment/order',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': data.length
  }
};

const req = http.request(options, res => {
  console.log(`statusCode: ${res.statusCode}`);
  res.on('data', d => process.stdout.write(d));
});

req.on('error', error => console.error(error));
req.write(data);
req.end();
