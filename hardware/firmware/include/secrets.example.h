#pragma once

// The first screen-only demo works with networking disabled.
constexpr bool WB_ENABLE_NETWORK = false;

// For local API testing, replace the IP with your computer's LAN IPv4 address.
// "localhost" points to the ESP32 itself and will not work from the board.
constexpr char WB_WIFI_SSID[] = "YOUR_WIFI_NAME";
constexpr char WB_WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
constexpr char WB_API_BASE_URL[] = "http://192.168.1.100:3000";
constexpr char WB_DEVICE_ID[] = "flower_01";
constexpr char WB_DEVICE_SECRET[] = "worthbloom-local-device";

// Production HTTPS: paste the root CA certificate for the final API domain.
// Temporary hackathon testing can set WB_ALLOW_INSECURE_TLS=true, but never
// ship a real device secret over insecure TLS.
constexpr bool WB_ALLOW_INSECURE_TLS = false;
constexpr char WB_TLS_ROOT_CA[] = "";
