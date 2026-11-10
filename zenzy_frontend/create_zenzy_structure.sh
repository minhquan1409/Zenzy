#!/usr/bin/env bash
# Zenzy – creates the lib/ and test/ folder structure (MVVM, feature-first).
# Usage: run inside a Flutter project made with `flutter create`:
#   bash create_zenzy_structure.sh          # current folder
#   bash create_zenzy_structure.sh my_app   # another folder
# Existing files are never overwritten.
set -euo pipefail
ROOT="${1:-.}"

mk() {  # mk <path under ROOT>
  local f="$ROOT/$1"
  mkdir -p "$(dirname "$f")"
  [ -e "$f" ] && return 0
  case "$f" in
    *.arb)  printf '{}\n' > "$f" ;;
    *.dart) printf '// TODO: %s\n' "$(basename "$f")" > "$f" ;;
    *)      : > "$f" ;;
  esac
}

# feature <name> <kind:file>...   kinds: m=model s=service r=repository vm=viewmodel v=view w=view/widgets
feature() {
  local n="$1"; shift
  local item kind file dir
  for item in "$@"; do
    kind="${item%%:*}"; file="${item#*:}"
    case "$kind" in
      m) dir=model ;; s) dir=service ;; r) dir=repository ;;
      vm) dir=viewmodel ;; v) dir=view ;; w) dir=view/widgets ;;
    esac
    mk "lib/features/$n/$dir/$file"
    case "$kind" in
      vm|r) mk "test/features/$n/$dir/${file%.dart}_test.dart" ;;
    esac
  done
}

# ---------- entry ----------
mk lib/main.dart
mk lib/app.dart

# ---------- core ----------
for f in api_endpoints app_constants socket_events storage_keys; do mk "lib/core/constants/$f.dart"; done
mk lib/core/config/env.dart
mk lib/core/di/providers.dart
for f in app_exception error_mapper; do mk "lib/core/error/$f.dart"; done
for f in api_client auth_interceptor idempotency_interceptor; do mk "lib/core/network/$f.dart"; done
for f in app_router route_names; do mk "lib/core/router/$f.dart"; done
for f in app_theme app_colors app_typography; do mk "lib/core/theme/$f.dart"; done
mk lib/core/ui_state/view_state.dart
for f in debouncer date_utils geo_utils validators; do mk "lib/core/utils/$f.dart"; done
for f in main_scaffold app_button loading_view empty_view error_view offline_banner; do mk "lib/core/widgets/$f.dart"; done

# ---------- l10n ----------
mk lib/l10n/app_en.arb
mk lib/l10n/app_vi.arb

# ---------- global models ----------
for f in api_response api_error lat_lng paginated; do mk "lib/models/$f.dart"; done

# ---------- global (device-level) services ----------
for f in secure_storage_service preferences_service local_database_service outbox_service \
         location_service background_location_service permission_service push_service \
         socket_service connectivity_service upload_service; do
  mk "lib/services/$f.dart"
done
mk lib/services/pending_action.dart

# ---------- features ----------
feature auth \
  m:user_model.dart m:auth_tokens.dart \
  s:auth_api_service.dart \
  r:auth_repository.dart \
  vm:auth_view_model.dart \
  v:splash_screen.dart v:login_screen.dart v:register_screen.dart

feature profile \
  m:profile_model.dart \
  s:profile_api_service.dart \
  r:profile_repository.dart \
  vm:profile_view_model.dart \
  v:profile_screen.dart v:edit_profile_screen.dart v:other_profile_screen.dart

feature friends \
  m:friend_model.dart m:friend_request_model.dart \
  s:friend_api_service.dart \
  r:friend_repository.dart \
  vm:friends_view_model.dart vm:add_friend_view_model.dart \
  v:friends_screen.dart v:add_friend_screen.dart v:friend_requests_screen.dart

feature privacy \
  m:privacy_settings.dart m:sharing_audience.dart \
  s:privacy_api_service.dart \
  r:privacy_repository.dart \
  vm:privacy_view_model.dart \
  v:privacy_settings_screen.dart v:close_friends_screen.dart v:blocklist_screen.dart

feature map \
  m:map_data.dart m:friend_location.dart m:map_marker.dart \
  s:map_api_service.dart \
  r:map_repository.dart r:location_repository.dart \
  vm:map_view_model.dart vm:search_view_model.dart \
  v:map_screen.dart v:search_screen.dart \
  w:friend_marker.dart w:event_marker.dart w:shop_marker.dart w:nearby_sheet.dart

feature events \
  m:event_model.dart m:participant_model.dart \
  s:event_api_service.dart \
  r:event_repository.dart \
  vm:event_list_view_model.dart vm:event_detail_view_model.dart vm:create_event_view_model.dart vm:manage_requests_view_model.dart \
  v:event_list_screen.dart v:event_detail_screen.dart v:create_event_screen.dart v:manage_requests_screen.dart

feature shops \
  m:shop_model.dart m:menu_item_model.dart m:flash_deal_model.dart \
  s:shop_api_service.dart \
  r:shop_repository.dart \
  vm:shop_detail_view_model.dart vm:create_shop_view_model.dart vm:my_shop_view_model.dart vm:flash_deal_view_model.dart \
  v:shop_detail_screen.dart v:create_shop_screen.dart v:my_shop_screen.dart v:create_flash_deal_screen.dart

feature feed \
  m:post_model.dart m:comment_model.dart \
  s:post_api_service.dart \
  r:post_repository.dart \
  vm:feed_view_model.dart vm:post_detail_view_model.dart vm:create_post_view_model.dart \
  v:feed_screen.dart v:post_detail_screen.dart v:create_post_screen.dart

feature chat \
  m:conversation_model.dart m:message_model.dart \
  s:chat_api_service.dart \
  r:chat_repository.dart \
  vm:conversations_view_model.dart vm:chat_room_view_model.dart \
  v:conversations_screen.dart v:chat_room_screen.dart

feature notifications \
  m:notification_model.dart m:notification_settings.dart \
  s:notification_api_service.dart \
  r:notification_repository.dart \
  vm:notifications_view_model.dart vm:notification_settings_view_model.dart \
  v:notifications_screen.dart v:notification_settings_screen.dart

feature report \
  m:report_model.dart m:report_reason.dart \
  s:report_api_service.dart \
  r:report_repository.dart \
  vm:report_view_model.dart \
  v:report_sheet.dart

# ---------- assets and integration tests ----------
mkdir -p "$ROOT/assets/images" "$ROOT/assets/icons" "$ROOT/integration_test"
echo "Done. Created structure under: $ROOT/lib and $ROOT/test"
