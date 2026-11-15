# Zenzy – Backend API, bản localhost (branch `duc`)

Branch này chỉ chứa phần việc của tôi: **API server** trả dữ liệu cho app Zenzy.
Code app/giao diện (`zenzy_frontend/`) giữ nguyên như branch `main`; nhóm app phụ trách phần đó.

| Thư mục | Nội dung | Công nghệ |
|---|---|---|
| `zenzy_backend/` | API server (REST `/v1` + Socket.IO) | Node 22+, NestJS 11, MongoDB Atlas, JWT, Zod |
| `zenzy_backend/docs/` | OpenAPI (Swagger), Postman collection, tài liệu deploy AWS | |
| `UI Mockup/` | Ảnh xuất từ Figma, dùng để đối chiếu dữ liệu API với màn hình | |

---

## 1. Địa chỉ server: một file duy nhất

Mọi địa chỉ (host, cổng API, cổng trang Swagger, MongoDB local, URL bản deploy) nằm ở
**`zenzy_backend/src/core/address.ts`**. `main.ts`, `config.ts` và các script (`seed:demo`, `docs`,
`docs:postman`) đều đọc từ đó. Khi deploy hoặc đổi cổng chỉ sửa file này.

Mặc định bản localhost:

| | Địa chỉ |
|---|---|
| REST API | `http://127.0.0.1:3100/v1` |
| Socket.IO | `http://127.0.0.1:3100/socket.io` |
| Health check | `http://127.0.0.1:3100/health` |
| Trang admin | `http://127.0.0.1:3100/admin/` |
| Swagger (`npm run docs`) | `http://127.0.0.1:8088` |

Server chỉ lắng nghe trên `127.0.0.1`: máy khác trong mạng không gọi được. Container Docker tự đặt
`HOST=0.0.0.0` (xem `Dockerfile`).

## 2. Database riêng cho localhost

Bản localhost dùng database **`zenzylocaldemo`** trên cùng cluster Atlas với DB chính.
Tự tạo DB của riêng mình vì DB chính không được truy cập tuỳ tiện, phải đi qua backend và API.
Tên DB đặt ở `MONGODB_DB` trong `zenzy_backend/.env`.

## 3. Chạy server

```bash
cd zenzy_backend
npm install
cp .env.example .env      # điền MONGODB_URI (chuỗi mongodb+srv:// của cluster) và JWT_SECRET
npm run start:dev         # in ra địa chỉ đang chạy và tên database
```

Kiểm tra: mở `http://127.0.0.1:3100/health`, thấy `{"status":"ok"}` là được.

Nạp dữ liệu mẫu (terminal khác, server đang chạy):

```bash
npm run seed:demo             # thêm `-- --live` để bạn bè demo di chuyển liên tục
```

Tài khoản mẫu: `minh`, `lan`, `vy.pham`, `hung`, `chloe`, `alex`; admin `thao`. Mật khẩu đều là `password123`.

Không dùng Atlas: chạy MongoDB trên máy bằng `docker compose -f docker-compose.dev.yml up -d --wait`
và bỏ trống `MONGODB_URI`.

App Android (emulator hoặc điện thoại cắm cáp) gọi server trên máy qua:

```bash
adb reverse tcp:3100 tcp:3100
```

## 4. Tài liệu API và test

```bash
npm run docs          # Swagger UI
npm run docs:postman  # tạo lại docs/postman/zenzy.postman_collection.json
npm test              # test API với MongoDB trong bộ nhớ
npm run typecheck && npm run lint
```

Hướng dẫn import Postman: `zenzy_backend/docs/postman/README.md`.

## 5. Lưu ý: bản localhost thiếu gì so với bản deploy

Đây là bản localhost. Các tính năng dưới đây cần dịch vụ ngoài nên chỉ bản chính thức đã deploy trên AWS
mới có đầy đủ (giao thức gọi giống hệt, xem Swagger và Postman để test thử bản deploy):

- **Upload ảnh:** không có S3; ảnh lưu vào `zenzy_backend/media-local/` và phục vụ ở `/media/`.
- **E-mail (mã đăng ký, đặt lại mật khẩu, cảnh báo admin):** không có SMTP; mã in ra log và trả kèm `dev_code`.
- **Đăng nhập Google:** cần `GOOGLE_CLIENT_IDS`.
- **Push notification:** cần `FCM_SERVICE_ACCOUNT_BASE64`.

## 6. Khi deploy

1. Sửa `src/core/address.ts` nếu cần (`deployedBaseUrl`, cổng).
2. Làm theo `zenzy_backend/docs/DEPLOY-AWS.md` (script ở `zenzy_backend/deploy/`).
3. Báo nhóm app URL mới.
