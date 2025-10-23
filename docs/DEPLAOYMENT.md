# Auth + LiveKit Integration Deployment Guide

## 1) Environment Variables
Set these in production:

- LIVEKIT_URL (e.g. wss://your-livekit-host)
- LIVEKIT_API_KEY
- LIVEKIT_API_SECRET
- MYSQL_HOST
- MYSQL_PORT (default 3306)
- MYSQL_USER
- MYSQL_PASSWORD
- MYSQL_DATABASE
- SESSION_TTL_MS (optional, default 900000 ms, i.e. 15 min)
- UID_SIGNING_SECRET (required; long random string for HMAC)

Example:
```
LIVEKIT_URL=wss://livekit.example.com
LIVEKIT_API_KEY=lk_...
LIVEKIT_API_SECRET=...
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=deeptalk
MYSQL_PASSWORD=********
MYSQL_DATABASE=deeptalk
SESSION_TTL_MS=900000
UID_SIGNING_SECRET=superlongrandomsecret_base64_or_hex
```

## 2) Database Checks
- `user_table` schema includes: `uuid`, `password`, `phone`, `mail`, `name`, `other`, `created_at`.
- `password` stores MD5 hash.
- Ensure unique index on `uuid`:
```
ALTER TABLE user_table ADD UNIQUE KEY idx_user_uuid (uuid);
```

## 3) What Changed
- Fixed room policy: `room = normalize("voice_assistant_" + uuid)`.
- `/api/sessions` and `/api/connection-details`:
  - Validate `uid` + `uidSig` (HMAC) from body or cookies (`dt_uid`, `dt_uid_sig`).
  - Use fixed `roomName` derived from `uuid`.
  - Identity defaults to `uuid` unless `participantId` is provided.
  - Support passing `participantName`, `metadata`, `attributes`, `agentName`.
- New endpoints:
  - `POST /api/auth/login`: login against MySQL MD5 password; sets `dt_uid` and `dt_uid_sig` cookies and returns `{ ok, uuid, name }`.
  - `GET /api/auth/me`: validate cookies, return `{ ok, uuid, name }`.

## 4) Frontend Flow
- Login: POST `/api/auth/login` with `{ username, password }`.
- On success, cookies `dt_uid`, `dt_uid_sig` are set (readable).
- Click “连接”: POST `/api/sessions` with `credentials: 'include'` and optional body:
```
{
  "participantName": "张三",
  "participantId": "optional-device-id",
  "metadata": { "role": "user" },
  "attributes": { "lang": "zh-CN" },
  "agentName": "assistant-a"
}
```
- Server derives `room` from `uuid` and returns `{ serverUrl, roomName, participantToken, participantName, sessionId }`.

## 5) Cookie Notes
- `dt_uid` & `dt_uid_sig` are readable cookies for convenience.
- Security enforced by signature validation + server-signed LiveKit token.
- Use HTTPS in production so cookies can be `Secure`.

## 6) Verification
- Login:
```
curl -i -X POST https://<domain>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"user@example.com","password":"secure123"}'
```
Expect `Set-Cookie: dt_uid=...` and `Set-Cookie: dt_uid_sig=...`.

- Connect:
```
curl -i -X POST https://<domain>/api/sessions \
  -H 'Content-Type: application/json' \
  --cookie "dt_uid=<uuid>; dt_uid_sig=<sig>" \
  -d '{"participantName":"Tester","metadata":{"k":"v"},"attributes":{"lang":"zh-CN"},"agentName":"assistant-a"}'
```
Expect `roomName` like `voice_assistant_<normalized-uuid>` and a `participantToken`.
