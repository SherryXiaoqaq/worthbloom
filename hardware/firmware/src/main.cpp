#include <Arduino.h>

#include "actuators.h"
#include "app_config.h"
#include "device_api.h"
#include "device_state.h"
#include "flower_ui.h"

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif

namespace {
FlowerUi ui;
Actuators actuators;
DeviceApi api;

DeviceState mockStates[] = {
    {FlowerMode::SEED, "New wish", "Plant a wish", "", 0.08f, 78},
    {FlowerMode::WAITING, "Iceland", "Waiting for friends", "", 0.34f, 82},
    {FlowerMode::GROWING, "Camera", "Getting closer", "", 0.64f, 86},
    {FlowerMode::BLOOM, "Camera", "You made it", "asset-demo", 1.0f, 100},
    {FlowerMode::HEALTHY, "Dance class", "Value in use", "asset-demo", 0.78f, 92},
    {FlowerMode::STRESSED, "A quick choice", "Take a breath", "asset-demo", 0.48f, 58},
    {FlowerMode::THIRSTY, "Dance class", "Use me again", "asset-demo", 0.28f, 46},
    {FlowerMode::RECOVERING, "Dance class", "Feeling better", "asset-demo", 0.70f, 74},
};
constexpr int mockStateCount = sizeof(mockStates) / sizeof(mockStates[0]);

DeviceState state = mockStates[0];
int mockIndex = 0;
unsigned long lastMockChangeAt = 0;
unsigned long lastRenderAt = 0;

bool stableButton = HIGH;
bool lastButtonReading = HIGH;
unsigned long buttonChangedAt = 0;

void applyMockState(int nextIndex) {
  mockIndex = (nextIndex + mockStateCount) % mockStateCount;
  state = mockStates[mockIndex];
  actuators.onModeChanged(state.mode, millis());
  Serial.printf("Mock state: %s\n", flowerModeName(state.mode));
}

void handleButton(unsigned long now) {
  const bool reading = digitalRead(WB_ACTION_BUTTON);
  if (reading != lastButtonReading) {
    buttonChangedAt = now;
    lastButtonReading = reading;
  }
  if (now - buttonChangedAt < 35 || reading == stableButton) return;
  stableButton = reading;
  if (stableButton != LOW) return;

  if (WB_ENABLE_NETWORK && !state.assetId.isEmpty()) {
    const bool saved = api.reportUsedToday(state);
    state.message = saved ? "Use recorded" : "Sync failed";
    if (saved) {
      state.mode = FlowerMode::RECOVERING;
      state.health = min(100, state.health + 8);
      actuators.onModeChanged(state.mode, now);
    }
  } else {
    applyMockState(mockIndex + 1);
    lastMockChangeAt = now;
  }
}
}

void setup() {
  Serial.begin(115200);
  delay(250);
  Serial.println("\nWorthBloom flower starting...");
  pinMode(WB_ACTION_BUTTON, INPUT_PULLUP);

  if (!ui.begin()) {
    Serial.println("Display init failed. Check that the selected board is ESP32-S3.");
  }
  actuators.begin();
  api.begin();
  actuators.onModeChanged(state.mode, millis());
  lastMockChangeAt = millis();
}

void loop() {
  const unsigned long now = millis();
  handleButton(now);

  if (WB_ENABLE_NETWORK) {
    const FlowerMode previousMode = state.mode;
    if (api.update(state, now) && state.mode != previousMode) actuators.onModeChanged(state.mode, now);
  } else if (now - lastMockChangeAt >= WB_MOCK_STATE_INTERVAL_MS) {
    applyMockState(mockIndex + 1);
    lastMockChangeAt = now;
  }

  actuators.update(state, now);
  if (now - lastRenderAt >= WB_RENDER_INTERVAL_MS) {
    lastRenderAt = now;
    ui.render(state, now, api.isOnline());
  }
  delay(2);
}
