#pragma once

#include <Arduino.h>
#include "device_state.h"

class DeviceApi {
 public:
  void begin();
  bool update(DeviceState& state, unsigned long now);
  bool reportUsedToday(const DeviceState& state);
  bool isOnline() const;

 private:
  bool fetchState(DeviceState& state);
  bool parseState(const String& payload, DeviceState& state);
  bool get(const String& url, String& payload);
  bool post(const String& url, const String& body, String& payload);
  bool sendUsedToday(const String& assetId, const String& clientEventId);
  void retryPendingAction(unsigned long now);
  void keepWifiAlive(unsigned long now);

  unsigned long lastPollAt_ = 0;
  unsigned long lastWifiAttemptAt_ = 0;
  unsigned long lastActionRetryAt_ = 0;
  String pendingAssetId_;
  String pendingEventId_;
};
