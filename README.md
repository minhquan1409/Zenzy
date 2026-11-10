# zenzy

A new Flutter module project.

## Getting Started

For help getting started with Flutter development, view the online
[documentation](https://flutter.dev/).

For instructions integrating Flutter modules to your existing applications,
see the [add-to-app documentation](https://flutter.dev/to/add-to-app).



zenzy-project/                                  # THƯ MỤC GỐC MONOREPO
├── .gitignore                                  # Bỏ qua node_modules, build, .env...
├── README.md
│
├── zenzy_frontend/                             # 1. MOBILE APP & ADMIN WEB (Flutter - MVVM)
│   ├── pubspec.yaml                            # Khai báo thư viện (dio, socket_io_client, hive/isar...)
│   ├── android/                                # Cấu hình Android (API 26+)
│   ├── ios/                                    # Cấu hình iOS (iOS 15+)
│   ├── macos/                                  # Cấu hình chạy thử trên macOS
│   ├── web/                                    # Cấu hình build Admin Dashboard (COMP-11)
│   │
│   ├── lib/                                    # MÃ NGUỒN CHÍNH (Feature-First + MVVM 4 tầng)
│   │   ├── main.dart                           # Điểm khởi chạy ứng dụng
│   │   ├── app.dart                            # Cấu hình MaterialApp, Theme, Router, Localization
│   │   │
│   │   ├── core/                               # Thành phần dùng chung toàn ứng dụng
│   │   │   ├── config/
│   │   │   │   └── env.dart                    # Biến môi trường phía Client (Base URL, Maps Key)
│   │   │   ├── constants/
│   │   │   │   ├── api_endpoints.dart          # Hằng số đường dẫn REST API (/v1/...)
│   │   │   │   ├── app_constants.dart          # Hằng số cấu hình (bán kính 5km, giới hạn 5 sự kiện...)
│   │   │   │   └── storage_keys.dart           # Khóa lưu trữ cho Secure Storage & Shared Preferences
│   │   │   ├── di/
│   │   │   │   └── providers.dart              # Dependency Injection (Provider / Riverpod)
│   │   │   ├── error/
│   │   │   │   ├── app_exception.dart          # Định nghĩa lỗi (400, 401, 403, 404, 409, 422, 429)
│   │   │   │   └── error_mapper.dart           # Chuyển mã lỗi API sang thông báo UI
│   │   │   ├── network/
│   │   │   │   ├── api_client.dart             # Cấu hình Dio/HTTP Client
│   │   │   │   └── auth_interceptor.dart       # Tự động đính kèm Bearer JWT & xoay vòng Refresh Token
│   │   │   ├── router/
│   │   │   │   ├── app_router.dart             # Điều hướng màn hình
│   │   │   │   └── route_names.dart
│   │   │   ├── theme/
│   │   │   │   ├── app_colors.dart             # Đảm bảo độ tương phản WCAG AA (NFR-13)
│   │   │   │   └── app_theme.dart
│   │   │   ├── ui_state/
│   │   │   │   └── view_state.dart             # Trạng thái chuẩn: Loading / Empty / Error / Loaded (NFR-17)
│   │   │   ├── utils/
│   │   │   │   ├── date_utils.dart             # Xử lý UTC sang giờ địa phương (NFR-19)
│   │   │   │   └── geo_utils.dart              # Tính khoảng cách, định dạng tọa độ
│   │   │   └── widgets/                        # Widget dùng chung (Skeleton, Offline Banner, Button...)
│   │   │
│   │   ├── l10n/                               # Đa ngôn ngữ: Tiếng Anh & Tiếng Việt (NFR-19)
│   │   │   ├── app_en.arb
│   │   │   └── app_vi.arb
│   │   │
│   │   ├── models/                             # Data Models dùng chung toàn cục
│   │   │   ├── api_response.dart
│   │   │   └── geo_point.dart                  # GeoJSON [longitude, latitude]
│   │   │
│   │   ├── services/                           # TẦNG SERVICE DÙNG CHUNG (Mục 4.5 & 5.2)
│   │   │   ├── secure_storage_service.dart     # Tier 1: Lưu JWT, Refresh Token (flutter_secure_storage)
│   │   │   ├── preferences_service.dart        # Tier 2: Lưu Ghost Mode flag, cài đặt (shared_preferences)
│   │   │   ├── local_cache_service.dart        # Tier 3: Cache NoSQL ngoại tuyến & Offline Queue (Hive/Isar)
│   │   │   ├── location_service.dart           # Lấy GPS thích ứng (15s khi di chuyển / 2m khi đứng yên)
│   │   │   ├── permission_service.dart         # Quản lý quyền GPS, Camera, Notification
│   │   │   ├── socket_service.dart             # Kết nối Socket.IO (location:update, chat:message...)
│   │   │   └── push_service.dart               # Nhận thông báo FCM
│   │   │
│   │   └── features/                           # CÁC MODULE TÍNH NĂNG (COMP-01 -> COMP-11)
│   │       ├── auth/                           # COMP-01: Đăng ký, Đăng nhập, Google OAuth (UC-01, UC-17)
│   │       │   ├── data/                       # (hoặc tách model/, service/, repository/)
│   │       │   │   ├── models/
│   │       │   │   ├── auth_api_service.dart
│   │       │   │   └── auth_repository.dart
│   │       │   ├── viewmodel/
│   │       │   │   └── auth_view_model.dart
│   │       │   └── view/
│   │       │       ├── splash_screen.dart
│   │       │       ├── login_screen.dart
│   │       │       └── register_screen.dart
│   │       │
│   │       ├── profile/                        # COMP-02 (Phần 1): Hồ sơ cá nhân & Đổi mật khẩu (UC-02)
│   │       │   ├── data/
│   │       │   ├── viewmodel/
│   │       │   └── view/
│   │       │
│   │       ├── friends/                        # COMP-02 (Phần 2): Bạn bè, Bạn thân, Chặn (UC-05)
│   │       │   ├── data/
│   │       │   ├── viewmodel/
│   │       │   └── view/
│   │       │
│   │       ├── privacy/                        # COMP-03: Ghost Mode & Thời hạn chia sẻ vị trí (UC-07, UC-23)
│   │       │   ├── data/
│   │       │   ├── viewmodel/
│   │       │   └── view/
│   │       │
│   │       ├── map/                            # COMP-04: Bản đồ thời gian thực & Tìm kiếm (UC-03, UC-04)
│   │       │   ├── data/
│   │       │   ├── viewmodel/
│   │       │   └── view/
│   │       │
│   │       ├── events/                         # COMP-05: Tạo sự kiện, Xin tham gia, Duyệt thành viên (UC-08 -> UC-11)
│   │       │   ├── data/
│   │       │   ├── viewmodel/
│   │       │   └── view/
│   │       │
│   │       ├── shops/                          # COMP-06: Cửa hàng, Menu & Flash Deals (UC-12 -> UC-15)
│   │       │   ├── data/
│   │       │   ├── viewmodel/
│   │       │   └── view/
│   │       │
│   │       ├── feed/                           # COMP-07: Bảng tin cộng đồng, Like, Comment, Save (UC-21)
│   │       │   ├── data/
│   │       │   ├── viewmodel/
│   │       │   └── view/
│   │       │
│   │       ├── chat/                           # COMP-08: Nhắn tin 1-1 & Nhóm sự kiện, Hàng đợi Offline (UC-06)
│   │       │   ├── data/
│   │       │   ├── viewmodel/
│   │       │   └── view/
│   │       │
│   │       ├── notifications/                  # COMP-09: Trung tâm thông báo & Cài đặt Push (UC-22)
│   │       │   ├── data/
│   │       │   ├── viewmodel/
│   │       │   └── view/
│   │       │
│   │       ├── report/                         # COMP-10: Hộp thoại báo cáo vi phạm (UC-16)
│   │       │   ├── data/
│   │       │   ├── viewmodel/
│   │       │   └── view/
│   │       │
│   │       └── admin/                          # COMP-11: Giao diện Web Admin Dashboard (UC-17 -> UC-20)
│   │           ├── data/
│   │           ├── viewmodel/
│   │           └── view/
│   │
│   └── test/                                   # UNIT TEST SOI GƯƠNG VỚI LIB/ (Mục tiêu >= 70% coverage - NFR-18)
│       └── features/
│           ├── auth/
│           ├── map/
│           └── events/
│
└── zenzy_backend/                              # 2. API SERVER & REALTIME GATEWAY (Node.js / NestJS)
    ├── .env                                    # Chứa MONGODB_URI, JWT Secrets, Cloudinary, FCM (Không đẩy lên Git)
    ├── package.json
    ├── tsconfig.json
    │
    ├── src/
    │   ├── main.ts                             # Khởi chạy server, cấu hình prefix '/v1', CORS, ValidationPipe
    │   ├── app.module.ts                       # Module gốc kết nối MongooseModule (MongoDB Atlas) & ConfigModule
    │   │
    │   ├── common/                             # TẦNG BẢO MẬT & KIỂM SOÁT TRUNG TÂM (Mục 4.1, NFR-09, NFR-15)
    │   │   ├── guards/
    │   │   │   ├── jwt-auth.guard.ts           # Xác thực JWT trên mọi route
    │   │   │   └── roles.guard.ts              # Phân quyền USER vs ADMIN (trả về 403 nếu không đủ quyền)
    │   │   ├── interceptors/
    │   │   │   └── idempotency.interceptor.ts  # Chống tạo trùng khi retry offline (NFR-06)
    │   │   ├── filters/
    │   │   │   └── http-exception.filter.ts    # Chuẩn hóa lỗi trả về: { code, message, timestamp } (Mục 5.3.1)
    │   │   └── services/
    │   │       ├── keyword-filter.service.ts   # Kiểm tra danh sách từ cấm banned_keywords (BR-01 -> trả về 422)
    │   │       └── visibility.service.ts       # Lọc quyền riêng tư (Ghost Mode, Close Friends, Block) trước khi trả vị trí
    │   │
    │   ├── realtime/                           # SOCKET.IO GATEWAY TRUNG TÂM (Mục 5.3.11)
    │   │   ├── realtime.gateway.ts             # Xử lý phòng 'user:<id>', phát sự kiện location:update, location:hide...
    │   │   └── realtime.module.ts
    │   │
    │   ├── auth/                               # Module Auth (Mục 5.3.2)
    │   │   ├── schemas/
    │   │   │   ├── credential.schema.ts        # Collection: credentials (chứa password_hash tách biệt - NFR-07)
    │   │   │   └── refresh-token.schema.ts     # Collection: refresh_tokens (có TTL index 30 ngày - NFR-08)
    │   │   ├── auth.controller.ts              # POST /auth/register, /login, /google, /refresh, /logout
    │   │   ├── auth.service.ts
    │   │   └── auth.module.ts
    │   │
    │   ├── users/                              # Module User & Privacy (Mục 5.3.2 & 5.3.3)
    │   │   ├── schemas/
    │   │   │   └── user.schema.ts              # Collection: users (ghost_mode, location_sharing, date_of_birth...)
    │   │   ├── me.controller.ts                # GET/PATCH/DELETE /me, PUT /me/password, PUT /me/privacy, PUT /me/guardian-consent
    │   │   ├── users.controller.ts             # GET /users, GET /users/:user_id
    │   │   ├── users.service.ts
    │   │   └── users.module.ts
    │   │
    │   ├── friendships/                        # Module Friends & Blocking (Mục 5.3.4)
    │   │   ├── schemas/
    │   │   │   ├── friendship.schema.ts        # Collection: friendships (unique pair user_a, user_b)
    │   │   │   └── block.schema.ts             # Collection: blocks (unique pair blocker_id, blocked_id)
    │   │   ├── friendships.controller.ts       # /friends, /friends/requests, /blocks...
    │   │   ├── friendships.service.ts
    │   │   └── friendships.module.ts
    │   │
    │   ├── locations/                          # Module Location & Map (Mục 4.2 & 5.3.3)
    │   │   ├── schemas/
    │   │   │   └── user-location.schema.ts     # Collection: user_locations (2dsphere index, TTL 900s / 15 phút - BR-05)
    │   │   ├── locations.controller.ts         # PUT /me/location, GET /map/nearby, GET /search
    │   │   ├── locations.service.ts
    │   │   └── locations.module.ts
    │   │
    │   ├── events/                             # Module Events (Mục 5.3.5)
    │   │   ├── schemas/
    │   │   │   ├── event.schema.ts             # Collection: events (2dsphere index, tối đa 5 active events - BR-02)
    │   │   │   └── event-participant.schema.ts # Collection: event_participants (unique event_id + user_id)
    │   │   ├── events.controller.ts            # /events, /events/:id/requests, /events/:id/members...
    │   │   ├── events.service.ts               # Dùng MongoDB Transaction khi duyệt thành viên & thêm vào nhóm chat
    │   │   └── events.module.ts
    │   │
    │   ├── shops/                              # Module Shops & Flash Deals (Mục 5.3.6)
    │   │   ├── schemas/
    │   │   │   ├── shop.schema.ts              # Collection: shops (nhúng mảng menu_item, mặc định PENDING - BR-04)
    │   │   │   └── flash-deal.schema.ts        # Collection: flash_deals (index shop_id + ends_at)
    │   │   ├── shops.controller.ts             # /shops, GET /me/shops, /shops/:shop_id/deals
    │   │   ├── shops.service.ts
    │   │   └── shops.module.ts
    │   │
    │   ├── posts/                              # Module Community Feed (Mục 5.3.7)
    │   │   ├── schemas/
    │   │   │   ├── post.schema.ts              # Collection: posts
    │   │   │   ├── post-like.schema.ts         # Collection: post_likes
    │   │   │   ├── post-comment.schema.ts      # Collection: post_comments
    │   │   │   └── saved-post.schema.ts        # Collection: saved_posts
    │   │   ├── posts.controller.ts             # /posts, /posts/:id/like, /posts/:id/comments, /me/saved-posts
    │   │   ├── posts.service.ts
    │   │   └── posts.module.ts
    │   │
    │   ├── uploads/                            # Module Signed Uploads (Mục 5.3.7)
    │   │   ├── uploads.controller.ts           # POST /uploads/sign (cấp Signed URL S3/Cloudinary cho ảnh <= 500KB)
    │   │   ├── uploads.service.ts
    │   │   └── uploads.module.ts
    │   │
    │   ├── chat/                               # Module Chat (Mục 5.3.8)
    │   │   ├── schemas/
    │   │   │   ├── conversation.schema.ts      # Collection: conversations (DIRECT, GROUP, EVENT)
    │   │   │   └── message.schema.ts           # Collection: messages
    │   │   ├── chat.controller.ts              # /conversations, /conversations/:id/messages...
    │   │   ├── chat.service.ts
    │   │   └── chat.module.ts
    │   │
    │   ├── notifications/                      # Module Notifications & Push (Mục 5.3.9)
    │   │   ├── schemas/
    │   │   │   ├── notification.schema.ts      # Collection: notifications
    │   │   │   └── device-token.schema.ts      # Collection: device_tokens
    │   │   ├── notifications.controller.ts     # /notifications, /me/notification-settings, /me/device-tokens
    │   │   ├── notifications.service.ts        # Gửi Push Notification qua Firebase (FCM)
    │   │   └── notifications.module.ts
    │   │
    │   └── moderation/                         # Module Reports & Admin Administration (Mục 5.3.10)
    │       ├── schemas/
    │       │   ├── report.schema.ts            # Collection: reports (3 người khác nhau report -> tự ẩn theo BR-03)
    │       │   ├── banned-keyword.schema.ts    # Collection: banned_keywords (BR-01)
    │       │   └── admin-audit-log.schema.ts   # Collection: admin_audit_log (Insert-only - BR-07, NFR-16)
    │       ├── reports.controller.ts           # POST /reports
    │       ├── admin.controller.ts             # GET/PATCH /admin/reports, /admin/shops, /admin/users
    │       ├── moderation.service.ts           # Dùng Transaction khi xử lý report + ghi audit log
    │       └── moderation.module.ts
    │
    └── test/                                   # Kiểm thử tự động cho Backend (kiểm tra phân quyền 403 - NFR-15, NFR-18)