#include "device_api.h"

#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include "app_config.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

namespace {
void addDeviceHeaders(HTTPClient& http) {
  http.addHeader("accept", "application/json");
  http.addHeader("x-device-key", WB_DEVICE_SECRET);
}

bool prepareSecureClient(WiFiClientSecure& client) {
  if (strlen(WB_TLS_ROOT_CA) > 0) {
    client.setCACert(WB_TLS_ROOT_CA);
    return true;
  }
  if (WB_ALLOW_INSECURE_TLS) {
    client.setInsecure();
    return true;
  }
  Serial.println("HTTPS blocked: add WB_TLS_ROOT_CA or explicitly allow insecure TLS for a demo.");
  return false;
}

String eventId() {
  const uint64_t chip = ESP.getEfuseMac();
  char buffer[64];
  snprintf(buffer, sizeof(buffer), "evt-%04X%08X-%lu", static_cast<uint16_t>(chip >> 32), static_cast<uint32_t>(chip), millis());
  return String(buffer);
}
}

void DeviceApi::begin() {
  if (!WB_ENABLE_NETWORK) {
    Serial.println("Network disabled: running the local flower story.");
    return;
  }
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WB_WIFI_SSID, WB_WIFI_PASSWORD);
  lastWifiAttemptAt_ = millis();
}

bool DeviceApi::isOnline() const {
  return WB_ENABLE_NETWORK && WiFi.status() == WL_CONNECTED;
}

void DeviceApi::keepWifiAlive(unsigned long now) {
  if (!WB_ENABLE_NETWORK || WiFi.status() == WL_CONNECTED) return;
  if (now - lastWifiAttemptAt_ < WB_WIFI_RETRY_INTERVAL_MS) return;
  lastWifiAttemptAt_ = now;
  Serial.println("Retrying Wi-Fi...");
  WiFi.disconnect();
  WiFi.begin(WB_WIFI_SSID, WB_WIFI_PASSWORD);
}

bool DeviceApi::get(const String& url, String& payload) {
  HTTPClient http;
  int code = -1;
  if (url.startsWith("https://")) {
    WiFiClientSecure client;
    if (!prepareSecureClient(client) || !http.begin(client, url)) return false;
    addDeviceHeaders(http);
    code = http.GET();
    if (code > 0) payload = http.getString();
    http.end();
  } else {
    WiFiClient client;
    if (!http.begin(client, url)) return false;
    addDeviceHeaders(http);
    code = http.GET();
    if (code > 0) payload = http.getString();
    http.end();
  }
  if (code < 200 || code >= 300) {
    Serial.printf("GET failed: HTTP %d\n", code);
    return false;
  }
  return true;
}

bool DeviceApi::post(const String& url, const String& body, String& payload) {
  HTTPClient http;
  int code = -1;
  if (url.startsWith("https://")) {
    WiFiClientSecure client;
    if (!prepareSecureClient(client) || !http.begin(client, url)) return false;
    addDeviceHeaders(http);
    http.addHeader("content-type", "application/json");
    code = http.POST(body);
    if (code > 0) payload = http.getString();
    http.end();
  } else {
    WiFiClient client;
    if (!http.begin(client, url)) return false;
    addDeviceHeaders(http);
    http.addHeader("content-type", "application/json");
    code = http.POST(body);
    if (code > 0) payload = http.getString();
    http.end();
  }
  if (code < 200 || code >= 300) {
    Serial.printf("POST failed: HTTP %d\n", code);
    return false;
  }
  return true;
}

bool DeviceApi::parseState(const String& payload, DeviceState& state) {
  JsonDocument document;
  const DeserializationError error = deserializeJson(document, payload);
  if (error) {
    Serial.printf("JSON error: %s\n", error.c_str());
    return false;
  }
  state.mode = flowerModeFromString(String(document["mode"] | "SEED"));
  state.title = String(document["title"] | "WorthBloom");
  state.message = String(document["message"] | "Growing with you");
  state.assetId = String(document["asset_id"] | "");
  state.progress = constrain(document["progress"] | 0.0f, 0.0f, 1.0f);
  state.health = constrain(document["flower_health"] | 80, 0, 100);
  return true;
}

bool DeviceApi::fetchState(DeviceState& state) {
  String payload;
  const String url = String(WB_API_BASE_URL) + "/api/device/state?device_id=" + WB_DEVICE_ID;
  return get(url, payload) && parseState(payload, state);
}

bool DeviceApi::update(DeviceState& state, unsigned long now) {
  if (!WB_ENABLE_NETWORK) return false;
  keepWifiAlive(now);
  if (!isOnline()) return false;
  retryPendingAction(now);
  if (now - lastPollAt_ < WB_API_POLL_INTERVAL_MS) return false;
  lastPollAt_ = now;
  return fetchState(state);
}

bool DeviceApi::sendUsedToday(const String& assetId, const String& clientEventId) {
  JsonDocument document;
  document["device_id"] = WB_DEVICE_ID;
  document["action"] = "USED_TODAY";
  document["asset_id"] = assetId;
  document["client_event_id"] = clientEventId;
  String body;
  serializeJson(document, body);
  String response;
  return post(String(WB_API_BASE_URL) + "/api/device/action", body, response);
}

void DeviceApi::retryPendingAction(unsigned long now) {
  if (pendingEventId_.isEmpty() || now - lastActionRetryAt_ < WB_API_POLL_INTERVAL_MS) return;
  lastActionRetryAt_ = now;
  if (sendUsedToday(pendingAssetId_, pendingEventId_)) {
    Serial.println("Queued action synced.");
    pendingAssetId_ = "";
    pendingEventId_ = "";
  }
}

bool DeviceApi::reportUsedToday(const DeviceState& state) {
  if (state.assetId.isEmpty()) return false;
  const String newEventId = eventId();
  if (isOnline() && sendUsedToday(state.assetId, newEventId)) return true;
  if (pendingEventId_.isEmpty()) {
    pendingAssetId_ = state.assetId;
    pendingEventId_ = newEventId;
    lastActionRetryAt_ = millis();
    Serial.println("Action queued until Wi-Fi returns.");
    return true;
  }
  return false;
}
