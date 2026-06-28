--
-- PostgreSQL database dump
--

\restrict h2mXUj9ukhoRYJEooN8qEWTEVnXqRjOaoc1yrcDf7d8xS2NPmskbW996BRRBa1z

-- Dumped from database version 17.10 (Debian 17.10-1.pgdg12+1)
-- Dumped by pg_dump version 17.10 (Debian 17.10-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

ALTER TABLE ONLY public.workforce_task_embeddings DROP CONSTRAINT workforce_task_embeddings_worker_id_fkey;
ALTER TABLE ONLY public.workforce_task_embeddings DROP CONSTRAINT workforce_task_embeddings_supervisor_id_fkey;
ALTER TABLE ONLY public.workforce_payment_embeddings DROP CONSTRAINT workforce_payment_embeddings_worker_id_fkey;
ALTER TABLE ONLY public.workforce_payment_embeddings DROP CONSTRAINT workforce_payment_embeddings_supervisor_id_fkey;
ALTER TABLE ONLY public.workers DROP CONSTRAINT workers_user_id_fkey;
ALTER TABLE ONLY public.workers DROP CONSTRAINT workers_supervisor_id_fkey;
ALTER TABLE ONLY public.worker_task_assignments DROP CONSTRAINT worker_task_assignments_worker_id_fkey;
ALTER TABLE ONLY public.worker_task_assignments DROP CONSTRAINT worker_task_assignments_supervisor_id_fkey;
ALTER TABLE ONLY public.visitor_events DROP CONSTRAINT visitor_events_reporter_id_fkey;
ALTER TABLE ONLY public.video_analyses DROP CONSTRAINT video_analyses_uploaded_by_fkey;
ALTER TABLE ONLY public.user_message_state DROP CONSTRAINT user_message_state_user_id_fkey;
ALTER TABLE ONLY public.task_notifications DROP CONSTRAINT task_notifications_worker_id_fkey;
ALTER TABLE ONLY public.supervisors DROP CONSTRAINT supervisors_user_id_fkey;
ALTER TABLE ONLY public.maintenance_logs DROP CONSTRAINT maintenance_logs_equipment_id_fkey;
ALTER TABLE ONLY public.leave_requests DROP CONSTRAINT leave_requests_worker_id_fkey;
ALTER TABLE ONLY public.leave_requests DROP CONSTRAINT leave_requests_supervisor_id_fkey;
ALTER TABLE ONLY public.leave_requests DROP CONSTRAINT leave_requests_reviewed_by_fkey;
ALTER TABLE ONLY public.equipment DROP CONSTRAINT equipment_created_by_fkey;
ALTER TABLE ONLY public.crops DROP CONSTRAINT crops_created_by_fkey;
ALTER TABLE ONLY public.chat_messages DROP CONSTRAINT chat_messages_worker_id_fkey;
ALTER TABLE ONLY public.chat_messages DROP CONSTRAINT chat_messages_supervisor_id_fkey;
ALTER TABLE ONLY public.chat_messages DROP CONSTRAINT chat_messages_sender_id_fkey;
ALTER TABLE ONLY public.chat_messages DROP CONSTRAINT chat_messages_group_id_fkey;
ALTER TABLE ONLY public.chat_message_extractions DROP CONSTRAINT chat_message_extractions_message_id_fkey;
ALTER TABLE ONLY public.chat_message_embeddings DROP CONSTRAINT chat_message_embeddings_message_id_fkey;
ALTER TABLE ONLY public.chat_groups DROP CONSTRAINT chat_groups_created_by_fkey;
ALTER TABLE ONLY public.chat_group_members DROP CONSTRAINT chat_group_members_user_id_fkey;
ALTER TABLE ONLY public.chat_group_members DROP CONSTRAINT chat_group_members_group_id_fkey;
ALTER TABLE ONLY public.alerts DROP CONSTRAINT alerts_created_by_fkey;
ALTER TABLE ONLY public.admin_login_otps DROP CONSTRAINT admin_login_otps_user_id_fkey;
DROP INDEX public.workforce_task_embeddings_vector_idx;
DROP INDEX public.workforce_task_embeddings_updated_at_idx;
DROP INDEX public.workforce_payment_embeddings_vector_idx;
DROP INDEX public.workforce_payment_embeddings_updated_at_idx;
DROP INDEX public.worker_task_assignments_worker_idx;
DROP INDEX public.worker_task_assignments_supervisor_idx;
DROP INDEX public.visitor_events_created_at_idx;
DROP INDEX public.video_analyses_created_at_idx;
DROP INDEX public.users_phone_number_unique_idx;
DROP INDEX public.task_notifications_worker_idx;
DROP INDEX public.maintenance_logs_equipment_idx;
DROP INDEX public.leave_requests_worker_idx;
DROP INDEX public.leave_requests_supervisor_idx;
DROP INDEX public.equipment_zone_idx;
DROP INDEX public.equipment_status_idx;
DROP INDEX public.equipment_next_service_idx;
DROP INDEX public.crops_zone_idx;
DROP INDEX public.crops_created_at_idx;
DROP INDEX public.chat_messages_created_at_idx;
DROP INDEX public.chat_message_extractions_updated_at_idx;
DROP INDEX public.chat_message_embeddings_vector_idx;
DROP INDEX public.chat_message_embeddings_updated_at_idx;
DROP INDEX public.alerts_created_at_idx;
DROP INDEX public.activity_logs_seed_unique_idx;
ALTER TABLE ONLY public.workforce_task_embeddings DROP CONSTRAINT workforce_task_embeddings_pkey;
ALTER TABLE ONLY public.workforce_payment_embeddings DROP CONSTRAINT workforce_payment_embeddings_pkey;
ALTER TABLE ONLY public.workers DROP CONSTRAINT workers_pkey;
ALTER TABLE ONLY public.worker_task_assignments DROP CONSTRAINT worker_task_assignments_pkey;
ALTER TABLE ONLY public.visitor_events DROP CONSTRAINT visitor_events_pkey;
ALTER TABLE ONLY public.video_analyses DROP CONSTRAINT video_analyses_pkey;
ALTER TABLE ONLY public.users DROP CONSTRAINT users_pkey;
ALTER TABLE ONLY public.users DROP CONSTRAINT users_email_key;
ALTER TABLE ONLY public.user_message_state DROP CONSTRAINT user_message_state_pkey;
ALTER TABLE ONLY public.task_notifications DROP CONSTRAINT task_notifications_pkey;
ALTER TABLE ONLY public.supervisors DROP CONSTRAINT supervisors_pkey;
ALTER TABLE ONLY public.maintenance_logs DROP CONSTRAINT maintenance_logs_pkey;
ALTER TABLE ONLY public.leave_requests DROP CONSTRAINT leave_requests_pkey;
ALTER TABLE ONLY public.equipment DROP CONSTRAINT equipment_pkey;
ALTER TABLE ONLY public.crops DROP CONSTRAINT crops_pkey;
ALTER TABLE ONLY public.chat_messages DROP CONSTRAINT chat_messages_pkey;
ALTER TABLE ONLY public.chat_message_extractions DROP CONSTRAINT chat_message_extractions_pkey;
ALTER TABLE ONLY public.chat_message_embeddings DROP CONSTRAINT chat_message_embeddings_pkey;
ALTER TABLE ONLY public.chat_groups DROP CONSTRAINT chat_groups_pkey;
ALTER TABLE ONLY public.chat_group_members DROP CONSTRAINT chat_group_members_pkey;
ALTER TABLE ONLY public.alerts DROP CONSTRAINT alerts_pkey;
ALTER TABLE ONLY public.admin_login_otps DROP CONSTRAINT admin_login_otps_pkey;
ALTER TABLE ONLY public.activity_logs DROP CONSTRAINT activity_logs_pkey;
ALTER TABLE public.activity_logs ALTER COLUMN id DROP DEFAULT;
DROP TABLE public.workforce_task_embeddings;
DROP TABLE public.workforce_payment_embeddings;
DROP TABLE public.workers;
DROP TABLE public.worker_task_assignments;
DROP TABLE public.visitor_events;
DROP TABLE public.video_analyses;
DROP TABLE public.users;
DROP TABLE public.user_message_state;
DROP TABLE public.task_notifications;
DROP TABLE public.supervisors;
DROP TABLE public.maintenance_logs;
DROP TABLE public.leave_requests;
DROP TABLE public.equipment;
DROP TABLE public.crops;
DROP TABLE public.chat_messages;
DROP TABLE public.chat_message_extractions;
DROP TABLE public.chat_message_embeddings;
DROP TABLE public.chat_groups;
DROP TABLE public.chat_group_members;
DROP TABLE public.alerts;
DROP TABLE public.admin_login_otps;
DROP SEQUENCE public.activity_logs_id_seq;
DROP TABLE public.activity_logs;
DROP EXTENSION vector;
--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: activity_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.activity_logs (
    id bigint NOT NULL,
    time_label text NOT NULL,
    person text NOT NULL,
    tag text NOT NULL,
    text text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: activity_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.activity_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: activity_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.activity_logs_id_seq OWNED BY public.activity_logs.id;


--
-- Name: admin_login_otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_login_otps (
    user_id text NOT NULL,
    phone_number text NOT NULL,
    otp_hash text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    consumed_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: alerts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alerts (
    id text NOT NULL,
    created_by text NOT NULL,
    zone text NOT NULL,
    severity text NOT NULL,
    title text NOT NULL,
    detail text NOT NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT alerts_severity_check CHECK ((severity = ANY (ARRAY['low'::text, 'medium'::text, 'high'::text])))
);


--
-- Name: chat_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_group_members (
    group_id uuid NOT NULL,
    user_id text NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_groups (
    id uuid NOT NULL,
    name text NOT NULL,
    created_by text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_message_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_message_embeddings (
    message_id uuid NOT NULL,
    embedding jsonb NOT NULL,
    content text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding_vector public.vector(768)
);


--
-- Name: chat_message_extractions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_message_extractions (
    message_id uuid NOT NULL,
    extracted jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id uuid NOT NULL,
    sender_id text NOT NULL,
    sender_name text NOT NULL,
    sender_role text NOT NULL,
    supervisor_id text,
    worker_id text,
    group_id uuid,
    scope text NOT NULL,
    tag text DEFAULT 'Update'::text NOT NULL,
    text text NOT NULL,
    image_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_messages_scope_check CHECK ((scope = ANY (ARRAY['global'::text, 'team'::text, 'worker'::text, 'group'::text]))),
    CONSTRAINT chat_messages_sender_role_check CHECK ((sender_role = ANY (ARRAY['Admin'::text, 'Supervisor'::text, 'Worker'::text])))
);


--
-- Name: crops; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.crops (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    variety text,
    zone text DEFAULT 'Not assigned'::text NOT NULL,
    quantity integer DEFAULT 0 NOT NULL,
    growth_stage text DEFAULT 'Seedling'::text NOT NULL,
    health_status text DEFAULT 'Healthy'::text NOT NULL,
    planted_date date,
    expected_harvest date,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: equipment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipment (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    type text DEFAULT 'General'::text NOT NULL,
    zone text DEFAULT 'Not assigned'::text NOT NULL,
    status text DEFAULT 'Operational'::text NOT NULL,
    purchase_date date,
    last_service_date date,
    next_service_date date,
    notes text,
    created_by text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: leave_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leave_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    worker_id text NOT NULL,
    worker_name text NOT NULL,
    supervisor_id text,
    start_date date NOT NULL,
    end_date date NOT NULL,
    reason text NOT NULL,
    leave_type text DEFAULT 'Sick'::text NOT NULL,
    status text DEFAULT 'Pending'::text NOT NULL,
    reviewed_by text,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: maintenance_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.maintenance_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    equipment_id uuid NOT NULL,
    service_type text DEFAULT 'Routine'::text NOT NULL,
    description text,
    cost integer,
    performed_by text,
    performed_date date DEFAULT CURRENT_DATE NOT NULL,
    next_due_date date,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: supervisors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supervisors (
    user_id text NOT NULL,
    zone text DEFAULT 'Not assigned'::text NOT NULL,
    active_tasks integer DEFAULT 0 NOT NULL,
    completed_today integer DEFAULT 0 NOT NULL,
    visitor_logs integer DEFAULT 0 NOT NULL,
    alerts integer DEFAULT 0 NOT NULL,
    performance text DEFAULT 'New'::text NOT NULL
);


--
-- Name: task_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.task_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    worker_id text NOT NULL,
    assigned_by text NOT NULL,
    task text NOT NULL,
    status text NOT NULL,
    zone text NOT NULL,
    dismissed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_message_state; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_message_state (
    user_id text NOT NULL,
    last_read_at timestamp with time zone,
    notifications_enabled boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id text NOT NULL,
    name text NOT NULL,
    email text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL,
    supervisor_id text,
    phone_number text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT users_role_check CHECK ((role = ANY (ARRAY['Admin'::text, 'Supervisor'::text, 'Worker'::text])))
);


--
-- Name: video_analyses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_analyses (
    id uuid NOT NULL,
    uploaded_by text NOT NULL,
    uploaded_by_name text NOT NULL,
    zone text NOT NULL,
    file_name text NOT NULL,
    status text NOT NULL,
    visitor_count integer DEFAULT 0 NOT NULL,
    unique_tracks integer DEFAULT 0 NOT NULL,
    summary_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_analyses_status_check CHECK ((status = ANY (ARRAY['processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: visitor_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visitor_events (
    id text NOT NULL,
    reporter_id text NOT NULL,
    reporter_name text NOT NULL,
    zone text NOT NULL,
    visitor_count integer NOT NULL,
    note text NOT NULL,
    image_url text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT visitor_events_visitor_count_check CHECK ((visitor_count >= 0))
);


--
-- Name: worker_task_assignments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.worker_task_assignments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    worker_id text NOT NULL,
    supervisor_id text,
    assigned_by text NOT NULL,
    task text NOT NULL,
    status text DEFAULT 'Ready'::text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    zone text DEFAULT 'Not assigned'::text NOT NULL,
    attendance text,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workers (
    user_id text NOT NULL,
    supervisor_id text,
    zone text DEFAULT 'Not assigned'::text NOT NULL,
    task text DEFAULT 'No active assignment'::text NOT NULL,
    status text DEFAULT 'Ready'::text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    attendance text DEFAULT 'Not marked'::text NOT NULL,
    logs_today integer DEFAULT 0 NOT NULL,
    salary_status text DEFAULT 'Not recorded'::text NOT NULL,
    daily_wage integer DEFAULT 0 NOT NULL,
    payment_mode text DEFAULT 'Daily wage'::text NOT NULL,
    payment_amount integer,
    payment_txn_id text,
    payment_date text,
    attendance_marked_at timestamp with time zone
);


--
-- Name: workforce_payment_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workforce_payment_embeddings (
    worker_id text NOT NULL,
    supervisor_id text,
    worker_name text NOT NULL,
    supervisor_name text,
    zone text NOT NULL,
    salary_status text NOT NULL,
    payment_mode text NOT NULL,
    payment_amount integer DEFAULT 0 NOT NULL,
    payment_txn_id text,
    payment_date text,
    daily_wage integer DEFAULT 0 NOT NULL,
    earned_today integer DEFAULT 0 NOT NULL,
    content text NOT NULL,
    embedding jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding_vector public.vector(768)
);


--
-- Name: workforce_task_embeddings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workforce_task_embeddings (
    worker_id text NOT NULL,
    supervisor_id text,
    worker_name text NOT NULL,
    supervisor_name text,
    zone text NOT NULL,
    task text NOT NULL,
    status text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    attendance text,
    content text NOT NULL,
    embedding jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    embedding_vector public.vector(768)
);


--
-- Name: activity_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs ALTER COLUMN id SET DEFAULT nextval('public.activity_logs_id_seq'::regclass);


--
-- Data for Name: activity_logs; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.activity_logs VALUES (1, '09:20', 'Asha Menon', 'Visitor entry', '5 visitors entered through Gate 2.', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.activity_logs VALUES (2, '10:05', 'Meera Nair', 'Task update', 'Packing batch B-18 image uploaded.', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.activity_logs VALUES (3, '10:42', 'Ravi Kumar', 'Alert', 'Visitor Gate density is above normal.', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.activity_logs VALUES (4, '11:10', 'Neha Rao', 'Visitor update', 'School group checked into Nursery Bay.', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.activity_logs VALUES (5, '11:35', 'Kavya Pillai', 'Task update', 'Stem quality inspection moved to supervisor review.', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.activity_logs VALUES (6, '12:05', 'Arjun Nair', 'Visitor entry', '7 visitors queued at Visitor Gate for the noon tour.', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.activity_logs VALUES (7, '12:07', 'System', 'Attendance', 'Auto-marked 11 worker(s) as Absent (no check-in by 9:05 AM).', '2026-06-09 06:37:11.356565+00');


--
-- Data for Name: admin_login_otps; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: alerts; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.alerts VALUES ('alert-seed-1', 'sup-2', 'Visitor Gate', 'high', 'Overcrowding detected', 'Visitor Gate density is above normal.', NULL, '2026-06-09 06:37:09.113925+00');
INSERT INTO public.alerts VALUES ('alert-seed-2', 'sup-1', 'Packing Unit', 'medium', 'Review pending cartons', 'Packing batch B-18 requires supervisor review.', NULL, '2026-06-09 06:37:09.113925+00');


--
-- Data for Name: chat_group_members; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: chat_groups; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: chat_message_embeddings; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: chat_message_extractions; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: crops; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: equipment; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: leave_requests; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: maintenance_logs; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: supervisors; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.supervisors VALUES ('sup-1', 'Greenhouse A and Packing Unit', 8, 5, 34, 1, '92%');
INSERT INTO public.supervisors VALUES ('sup-2', 'Nursery Bay and Visitor Gate', 6, 4, 24, 2, '87%');


--
-- Data for Name: task_notifications; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: user_message_state; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.user_message_state VALUES ('fe1c2af0-4b3d-45f5-bed5-46e18420f7cc', NULL, false, '2026-06-09 06:37:11.359644+00');


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.users VALUES ('fe1c2af0-4b3d-45f5-bed5-46e18420f7cc', 'Honey 254', 'honey02052004@gmail.com', '71fe1d10808de60cd44ac66ca033a46c:6feef4f95ea6c58c4abe2f95277bfe4fdfc3aa1397629711b0eb44261129daca890090398e44b6fe55fabb45825788a0d697cd323a28d8b93931ec07bd9cc18e', 'Worker', NULL, NULL, '2026-06-09 06:37:10.21526+00');
INSERT INTO public.users VALUES ('admin-1', 'Farm Administrator', 'admin@florisight.local', '21579cebed1d16a4b82d8c314cb2cf32:dfd21d982dcb3ef6ce302fbcd860ddf95b6f3e741bf698688b7df8c36e238a49889cbf9345d660b3823cc80d2218f3a7c1900c56ff551d7a1caa7cb9f5c8dabf', 'Admin', NULL, '+919876543210', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('admin-2', 'Operations Admin', 'operations@florisight.local', '62a5f92b8971e0b7ca149eab4b9c3daa:77beb27ddb71c01469d9eb9540675a0040d77d7bccf44e93ba8eb39220185b0d0b8a19662a2790b3f6cbb3bb8749be1fb2a29564e310476b06b6772e3eb4ec2b', 'Admin', NULL, '+919876543211', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('sup-1', 'Asha Menon', 'asha@florisight.local', '4e976e779e8e90587473a0b1062d6e89:be4a5460ec725e099c03d7d432f765966983ad88922c6fd2e38900be4edc6a6cbe90c915b457eec431618cfe0a75087bc3a5e2f7ee734f498fa4fba91aa9f5af', 'Supervisor', NULL, '', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('sup-2', 'Ravi Kumar', 'ravi@florisight.local', '9112ba2624d6388a79a0510c7ac392f3:02a07a3f1861febf97ff34f87d1a54be212d1a72853c22cc84f79f9fb331c705812699c23ba75b86a3d2e0d164273c89aeb462b6f93d745f60b9e1e6ea7b2e2f', 'Supervisor', NULL, '', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('wrk-1', 'Meera Nair', 'meera@florisight.local', '8b3ced1530394517c994963272a531ca:31946be8c59651a71cd842033df77501e57479fa25357c8c37d4a5591bfe691ffa27c266c9bd3a1dad67000a418e4bfba122e97bd514c4db78e8e119276c5cfc', 'Worker', 'sup-1', '', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('wrk-2', 'Anil Das', 'anil@florisight.local', '138d21e9bd941de53e979e47b72dd8ed:5e1dddd13dfe8427191c44e74946307039ef36d3df01938fc0d83a51779dffe97da2c52f4fe589d0997f2d4ff4c9e2bf018e920b3ae0c464de7f00be74423aa9', 'Worker', 'sup-1', '', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('wrk-3', 'Priya Iyer', 'priya@florisight.local', '80e3ddb4bd2e585e8e38d5b16b2ca8b4:b311fe6f3049f7bdb0eeedb45ace1972d51aba899c0aee9ab0ca935e3e73814653b90582f49482ba4f341dd8828621c41e1d830932375cfc40b0058043ce4409', 'Worker', 'sup-1', '', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('wrk-4', 'Rohit Sen', 'rohit@florisight.local', '16238c31524faf7434e38a3b9d81b331:9fc71a64c680feff07d77d7f3ff39e51abdc8c6cf2e557cec6726fabb49ea228b7165a17278ca69fb1aefa3a94e0473517fb4594312d323b76b642115bb09236', 'Worker', 'sup-1', '', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('wrk-5', 'Kavya Pillai', 'kavya@florisight.local', '2bde96940df4bf2e3cdf3f354cb725a6:a04707e8ac66cf2341e829a8b0c144a85a0bc010d6547a9228309051c421e2faa57d9c886d5ebc944739260e248c2a6963bfec50c248d1e8588b650b7b464d33', 'Worker', 'sup-1', '', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('wrk-6', 'Neha Rao', 'neha@florisight.local', '01b36d8d76e2434459c1b27111facc9e:c6275a45c12171f0db03a0bca734cd8ef23ea9166809faf2c4be08c8ae4b1c9664a0c533030c7791230c38101b66f3d6adb1fd6641d90f048529914f9583853b', 'Worker', 'sup-2', '', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('wrk-7', 'Kiran Shetty', 'kiran@florisight.local', 'cc60759d5ef271c0ad6119b57ae39eff:1da5b69d1a8935f36edfdcdf71432e4c9f5d51676ac5ba913b0305a39438b004c57a9786d0dc15cb558ebd940ac9a92cf361ac3da5a2a26b69bcefd9f8dadb5c', 'Worker', 'sup-2', '', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('wrk-8', 'Arjun Nair', 'arjun@florisight.local', 'bb15f17c45edc2a1e689682bc7f904ba:38fdf1f6889fab09d38e2bf3fe419ef5fb68e50f515271edbc575333b2e4c239a3b47991e8630548d72d7411a69e68bb9d9cb8c484d6a4494cabbd110b112963', 'Worker', 'sup-2', '', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('wrk-9', 'Sneha Das', 'sneha@florisight.local', 'eb37ac3139e1479e18b33247cb5cee3e:5e9aa5d64725a0f477eed3ae09ffdc4781f854632ed5d1e3feb0fc4e0fc0ec29f07cc067a24a4f037708d787bef5483c62c1a0ef0042ec56e3eb68093c16194f', 'Worker', 'sup-2', '', '2026-06-09 06:37:09.113925+00');
INSERT INTO public.users VALUES ('wrk-10', 'Vivek Kumar', 'vivek@florisight.local', 'aab692fb6ea4551a1698d3a64386b4ae:2e08996e9c48842bdbb7cb031be8004ca48ea67532465ced5b118cd2d684eceee3fbe24fb2b48dfc7d339932c49d768e16469b4d55028ed37d4a3a9668da1763', 'Worker', 'sup-2', '', '2026-06-09 06:37:09.113925+00');


--
-- Data for Name: video_analyses; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: visitor_events; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.visitor_events VALUES ('visitor-seed-1', 'sup-1', 'Asha Menon', 'Visitor Gate', 5, 'Morning greenhouse tour check-in', NULL, '2026-06-09 06:37:09.113925+00');
INSERT INTO public.visitor_events VALUES ('visitor-seed-2', 'wrk-6', 'Neha Rao', 'Nursery Bay', 12, 'School group reached Nursery Bay', NULL, '2026-06-09 06:37:09.113925+00');


--
-- Data for Name: worker_task_assignments; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: workers; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.workers VALUES ('wrk-9', 'sup-2', 'Nursery Bay', 'No active assignment', 'Ready', 0, 'Absent', 0, 'Not recorded', 0, 'Daily wage', NULL, NULL, NULL, '2026-06-09 06:37:11.348719+00');
INSERT INTO public.workers VALUES ('wrk-10', 'sup-2', 'Visitor Gate', 'No active assignment', 'Ready', 0, 'Absent', 0, 'Not recorded', 0, 'Daily wage', NULL, NULL, NULL, '2026-06-09 06:37:11.348719+00');
INSERT INTO public.workers VALUES ('fe1c2af0-4b3d-45f5-bed5-46e18420f7cc', NULL, 'Not assigned', 'No active assignment', 'Ready', 0, 'Absent', 0, 'Not recorded', 0, 'Daily wage', NULL, NULL, NULL, '2026-06-09 06:37:11.348719+00');
INSERT INTO public.workers VALUES ('wrk-1', 'sup-1', 'Greenhouse A', 'No active assignment', 'Ready', 0, 'Absent', 0, 'Not recorded', 0, 'Daily wage', NULL, NULL, NULL, '2026-06-09 06:37:11.348719+00');
INSERT INTO public.workers VALUES ('wrk-2', 'sup-1', 'Packing Unit', 'No active assignment', 'Ready', 0, 'Absent', 0, 'Not recorded', 0, 'Daily wage', NULL, NULL, NULL, '2026-06-09 06:37:11.348719+00');
INSERT INTO public.workers VALUES ('wrk-3', 'sup-1', 'Greenhouse A', 'No active assignment', 'Ready', 0, 'Absent', 0, 'Not recorded', 0, 'Daily wage', NULL, NULL, NULL, '2026-06-09 06:37:11.348719+00');
INSERT INTO public.workers VALUES ('wrk-4', 'sup-1', 'Packing Unit', 'No active assignment', 'Ready', 0, 'Absent', 0, 'Not recorded', 0, 'Daily wage', NULL, NULL, NULL, '2026-06-09 06:37:11.348719+00');
INSERT INTO public.workers VALUES ('wrk-5', 'sup-1', 'Greenhouse A', 'No active assignment', 'Ready', 0, 'Absent', 0, 'Not recorded', 0, 'Daily wage', NULL, NULL, NULL, '2026-06-09 06:37:11.348719+00');
INSERT INTO public.workers VALUES ('wrk-6', 'sup-2', 'Visitor Gate', 'No active assignment', 'Ready', 0, 'Absent', 0, 'Not recorded', 0, 'Daily wage', NULL, NULL, NULL, '2026-06-09 06:37:11.348719+00');
INSERT INTO public.workers VALUES ('wrk-7', 'sup-2', 'Nursery Bay', 'No active assignment', 'Ready', 0, 'Absent', 0, 'Not recorded', 0, 'Daily wage', NULL, NULL, NULL, '2026-06-09 06:37:11.348719+00');
INSERT INTO public.workers VALUES ('wrk-8', 'sup-2', 'Visitor Gate', 'No active assignment', 'Ready', 0, 'Absent', 0, 'Not recorded', 0, 'Daily wage', NULL, NULL, NULL, '2026-06-09 06:37:11.348719+00');


--
-- Data for Name: workforce_payment_embeddings; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Data for Name: workforce_task_embeddings; Type: TABLE DATA; Schema: public; Owner: -
--



--
-- Name: activity_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.activity_logs_id_seq', 25, true);


--
-- Name: activity_logs activity_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.activity_logs
    ADD CONSTRAINT activity_logs_pkey PRIMARY KEY (id);


--
-- Name: admin_login_otps admin_login_otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_login_otps
    ADD CONSTRAINT admin_login_otps_pkey PRIMARY KEY (user_id);


--
-- Name: alerts alerts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_pkey PRIMARY KEY (id);


--
-- Name: chat_group_members chat_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_group_members
    ADD CONSTRAINT chat_group_members_pkey PRIMARY KEY (group_id, user_id);


--
-- Name: chat_groups chat_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_groups
    ADD CONSTRAINT chat_groups_pkey PRIMARY KEY (id);


--
-- Name: chat_message_embeddings chat_message_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_embeddings
    ADD CONSTRAINT chat_message_embeddings_pkey PRIMARY KEY (message_id);


--
-- Name: chat_message_extractions chat_message_extractions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_extractions
    ADD CONSTRAINT chat_message_extractions_pkey PRIMARY KEY (message_id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: crops crops_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crops
    ADD CONSTRAINT crops_pkey PRIMARY KEY (id);


--
-- Name: equipment equipment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_pkey PRIMARY KEY (id);


--
-- Name: leave_requests leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_pkey PRIMARY KEY (id);


--
-- Name: maintenance_logs maintenance_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT maintenance_logs_pkey PRIMARY KEY (id);


--
-- Name: supervisors supervisors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisors
    ADD CONSTRAINT supervisors_pkey PRIMARY KEY (user_id);


--
-- Name: task_notifications task_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_notifications
    ADD CONSTRAINT task_notifications_pkey PRIMARY KEY (id);


--
-- Name: user_message_state user_message_state_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_message_state
    ADD CONSTRAINT user_message_state_pkey PRIMARY KEY (user_id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: video_analyses video_analyses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_analyses
    ADD CONSTRAINT video_analyses_pkey PRIMARY KEY (id);


--
-- Name: visitor_events visitor_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_events
    ADD CONSTRAINT visitor_events_pkey PRIMARY KEY (id);


--
-- Name: worker_task_assignments worker_task_assignments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_task_assignments
    ADD CONSTRAINT worker_task_assignments_pkey PRIMARY KEY (id);


--
-- Name: workers workers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_pkey PRIMARY KEY (user_id);


--
-- Name: workforce_payment_embeddings workforce_payment_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payment_embeddings
    ADD CONSTRAINT workforce_payment_embeddings_pkey PRIMARY KEY (worker_id);


--
-- Name: workforce_task_embeddings workforce_task_embeddings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_task_embeddings
    ADD CONSTRAINT workforce_task_embeddings_pkey PRIMARY KEY (worker_id);


--
-- Name: activity_logs_seed_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX activity_logs_seed_unique_idx ON public.activity_logs USING btree (time_label, person, tag, text);


--
-- Name: alerts_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX alerts_created_at_idx ON public.alerts USING btree (created_at DESC);


--
-- Name: chat_message_embeddings_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_message_embeddings_updated_at_idx ON public.chat_message_embeddings USING btree (updated_at DESC);


--
-- Name: chat_message_embeddings_vector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_message_embeddings_vector_idx ON public.chat_message_embeddings USING ivfflat (embedding_vector public.vector_cosine_ops);


--
-- Name: chat_message_extractions_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_message_extractions_updated_at_idx ON public.chat_message_extractions USING btree (updated_at DESC);


--
-- Name: chat_messages_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_created_at_idx ON public.chat_messages USING btree (created_at DESC);


--
-- Name: crops_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crops_created_at_idx ON public.crops USING btree (created_at DESC);


--
-- Name: crops_zone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX crops_zone_idx ON public.crops USING btree (zone);


--
-- Name: equipment_next_service_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX equipment_next_service_idx ON public.equipment USING btree (next_service_date);


--
-- Name: equipment_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX equipment_status_idx ON public.equipment USING btree (status);


--
-- Name: equipment_zone_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX equipment_zone_idx ON public.equipment USING btree (zone);


--
-- Name: leave_requests_supervisor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_requests_supervisor_idx ON public.leave_requests USING btree (supervisor_id, status, created_at DESC);


--
-- Name: leave_requests_worker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX leave_requests_worker_idx ON public.leave_requests USING btree (worker_id, created_at DESC);


--
-- Name: maintenance_logs_equipment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX maintenance_logs_equipment_idx ON public.maintenance_logs USING btree (equipment_id, performed_date DESC);


--
-- Name: task_notifications_worker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX task_notifications_worker_idx ON public.task_notifications USING btree (worker_id, dismissed, created_at DESC);


--
-- Name: users_phone_number_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX users_phone_number_unique_idx ON public.users USING btree (phone_number) WHERE ((phone_number IS NOT NULL) AND (phone_number <> ''::text));


--
-- Name: video_analyses_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX video_analyses_created_at_idx ON public.video_analyses USING btree (created_at DESC);


--
-- Name: visitor_events_created_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visitor_events_created_at_idx ON public.visitor_events USING btree (created_at DESC);


--
-- Name: worker_task_assignments_supervisor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX worker_task_assignments_supervisor_idx ON public.worker_task_assignments USING btree (supervisor_id, recorded_at DESC);


--
-- Name: worker_task_assignments_worker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX worker_task_assignments_worker_idx ON public.worker_task_assignments USING btree (worker_id, recorded_at DESC);


--
-- Name: workforce_payment_embeddings_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_payment_embeddings_updated_at_idx ON public.workforce_payment_embeddings USING btree (updated_at DESC);


--
-- Name: workforce_payment_embeddings_vector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_payment_embeddings_vector_idx ON public.workforce_payment_embeddings USING ivfflat (embedding_vector public.vector_cosine_ops);


--
-- Name: workforce_task_embeddings_updated_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_task_embeddings_updated_at_idx ON public.workforce_task_embeddings USING btree (updated_at DESC);


--
-- Name: workforce_task_embeddings_vector_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX workforce_task_embeddings_vector_idx ON public.workforce_task_embeddings USING ivfflat (embedding_vector public.vector_cosine_ops);


--
-- Name: admin_login_otps admin_login_otps_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_login_otps
    ADD CONSTRAINT admin_login_otps_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: alerts alerts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alerts
    ADD CONSTRAINT alerts_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_group_members chat_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_group_members
    ADD CONSTRAINT chat_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;


--
-- Name: chat_group_members chat_group_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_group_members
    ADD CONSTRAINT chat_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_groups chat_groups_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_groups
    ADD CONSTRAINT chat_groups_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_message_embeddings chat_message_embeddings_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_embeddings
    ADD CONSTRAINT chat_message_embeddings_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_message_extractions chat_message_extractions_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_message_extractions
    ADD CONSTRAINT chat_message_extractions_message_id_fkey FOREIGN KEY (message_id) REFERENCES public.chat_messages(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.chat_groups(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: chat_messages chat_messages_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: crops crops_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.crops
    ADD CONSTRAINT crops_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: equipment equipment_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipment
    ADD CONSTRAINT equipment_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leave_requests leave_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leave_requests leave_requests_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: leave_requests leave_requests_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leave_requests
    ADD CONSTRAINT leave_requests_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: maintenance_logs maintenance_logs_equipment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.maintenance_logs
    ADD CONSTRAINT maintenance_logs_equipment_id_fkey FOREIGN KEY (equipment_id) REFERENCES public.equipment(id) ON DELETE CASCADE;


--
-- Name: supervisors supervisors_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supervisors
    ADD CONSTRAINT supervisors_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: task_notifications task_notifications_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.task_notifications
    ADD CONSTRAINT task_notifications_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_message_state user_message_state_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_message_state
    ADD CONSTRAINT user_message_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: video_analyses video_analyses_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_analyses
    ADD CONSTRAINT video_analyses_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: visitor_events visitor_events_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visitor_events
    ADD CONSTRAINT visitor_events_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: worker_task_assignments worker_task_assignments_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_task_assignments
    ADD CONSTRAINT worker_task_assignments_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: worker_task_assignments worker_task_assignments_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.worker_task_assignments
    ADD CONSTRAINT worker_task_assignments_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workers workers_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workers workers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workers
    ADD CONSTRAINT workers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workforce_payment_embeddings workforce_payment_embeddings_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payment_embeddings
    ADD CONSTRAINT workforce_payment_embeddings_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workforce_payment_embeddings workforce_payment_embeddings_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_payment_embeddings
    ADD CONSTRAINT workforce_payment_embeddings_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: workforce_task_embeddings workforce_task_embeddings_supervisor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_task_embeddings
    ADD CONSTRAINT workforce_task_embeddings_supervisor_id_fkey FOREIGN KEY (supervisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: workforce_task_embeddings workforce_task_embeddings_worker_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workforce_task_embeddings
    ADD CONSTRAINT workforce_task_embeddings_worker_id_fkey FOREIGN KEY (worker_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict h2mXUj9ukhoRYJEooN8qEWTEVnXqRjOaoc1yrcDf7d8xS2NPmskbW996BRRBa1z

