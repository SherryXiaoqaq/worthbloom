#include "actuators.h"

#include "app_config.h"

namespace {
int angleForProgress(int percent) {
  percent = constrain(percent, 0, 100);
  return map(percent, 0, 100, WB_SERVO_CLOSED_ANGLE, WB_SERVO_OPEN_ANGLE);
}
}

void Actuators::begin() {
  if (WB_ENABLE_SERVO) {
    ledcSetup(WB_SERVO_CHANNEL, WB_SERVO_PWM_FREQUENCY, WB_SERVO_PWM_RESOLUTION);
    ledcAttachPin(WB_SERVO_PIN, WB_SERVO_CHANNEL);
    currentAngle_ = WB_SERVO_CLOSED_ANGLE;
    targetAngle_ = WB_SERVO_CLOSED_ANGLE;
    startAngle_ = currentAngle_;
    setServoAngle(currentAngle_);
  }
}

void Actuators::setServoAngle(int angle) {
  if (!WB_ENABLE_SERVO) return;
  angle = constrain(angle, 0, 180);
  const uint32_t duty = map(angle, 0, 180, WB_SERVO_DUTY_AT_OPEN, WB_SERVO_DUTY_AT_CLOSED);
  ledcWrite(WB_SERVO_CHANNEL, duty);
}

void Actuators::setProgress(int percent, unsigned long now) {
  const int nextTargetAngle = angleForProgress(percent);
  if (nextTargetAngle == targetAngle_) return;
  startAngle_ = currentAngle_;
  targetAngle_ = nextTargetAngle;
  rotationStartedAt_ = now;
}

void Actuators::onModeChanged(FlowerMode mode, unsigned long now) {
  lastMode_ = mode;
  (void)mode;
  (void)now;
}

void Actuators::update(const DeviceState& state, unsigned long now) {
  if (state.mode != lastMode_) onModeChanged(state.mode, now);

  if (!WB_ENABLE_SERVO || currentAngle_ == targetAngle_) return;

  const unsigned long elapsed = now - rotationStartedAt_;
  const float ratio = WB_SERVO_ROTATE_TIME_MS == 0
      ? 1.0f
      : min(1.0f, static_cast<float>(elapsed) / static_cast<float>(WB_SERVO_ROTATE_TIME_MS));
  currentAngle_ = static_cast<int>(startAngle_ + (targetAngle_ - startAngle_) * ratio);
  setServoAngle(currentAngle_);
}
