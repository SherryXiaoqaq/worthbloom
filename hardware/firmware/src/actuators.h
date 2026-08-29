#pragma once

#include <Arduino.h>
#include "device_state.h"

class Actuators {
 public:
  void begin();
  void update(const DeviceState& state, unsigned long now);
  void onModeChanged(FlowerMode mode, unsigned long now);

 private:
  void setServoAngle(int angle);
  FlowerMode lastMode_ = FlowerMode::SEED;
};
