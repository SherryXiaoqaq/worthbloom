#include "actuators.h"

#include "app_config.h"

namespace {
int modeAngle(const DeviceState& state) {
  if (state.mode == FlowerMode::GROWING || state.mode == FlowerMode::WAITING || state.mode == FlowerMode::BLOOM) {
    const float progress = constrain(state.progress, 0.0f, 1.0f);
    return WB_SERVO_CLOSED_ANGLE + static_cast<int>(progress * (WB_SERVO_OPEN_ANGLE - WB_SERVO_CLOSED_ANGLE));
  }
  if (state.mode == FlowerMode::HEALTHY) return 112;
  if (state.mode == FlowerMode::RECOVERING) return 92;
  if (state.mode == FlowerMode::STRESSED || state.mode == FlowerMode::THIRSTY) return 34;
  return 45;
}
}

void Actuators::begin() {
  if (WB_ENABLE_SERVO) {
    ledcSetup(WB_SERVO_CHANNEL, 50, 16);
    ledcAttachPin(WB_SERVO_PIN, WB_SERVO_CHANNEL);
    setServoAngle(WB_SERVO_CLOSED_ANGLE);
  }
}

void Actuators::setServoAngle(int angle) {
  if (!WB_ENABLE_SERVO) return;
  angle = constrain(angle, 0, 180);
  const uint32_t pulseUs = map(angle, 0, 180, 550, 2350);
  const uint32_t duty = pulseUs * 65535UL / 20000UL;
  ledcWrite(WB_SERVO_CHANNEL, duty);
}

void Actuators::onModeChanged(FlowerMode mode, unsigned long now) {
  lastMode_ = mode;
  (void)mode;
  (void)now;
}

void Actuators::update(const DeviceState& state, unsigned long now) {
  if (state.mode != lastMode_) onModeChanged(state.mode, now);

  if (WB_ENABLE_SERVO) setServoAngle(modeAngle(state));
}
