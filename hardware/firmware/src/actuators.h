#pragma once

#include <Arduino.h>
#include "device_state.h"

class Actuators {
 public:
  void begin();
  void setProgress(int percent, unsigned long now);
  void update(const DeviceState& state, unsigned long now);
  void onModeChanged(FlowerMode mode, unsigned long now);

 private:
  void setServoAngle(int angle);
  FlowerMode lastMode_ = FlowerMode::SEED;
  int currentAngle_ = 180;
  int targetAngle_ = 180;
  int startAngle_ = 180;
  unsigned long rotationStartedAt_ = 0;
};
