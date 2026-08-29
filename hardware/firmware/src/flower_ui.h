#pragma once

#include <Arduino.h>
#include "device_state.h"

class FlowerUi {
 public:
  bool begin();
  void render(const DeviceState& state, unsigned long now, bool bleConnected);

 private:
  void centeredText(const String& text, int y, uint8_t size, uint16_t color);
  uint16_t stateColor(FlowerMode mode) const;
  void drawFlower(const DeviceState& state, unsigned long now, uint16_t accent);
  void drawProgress(float progress, uint16_t color);
};
