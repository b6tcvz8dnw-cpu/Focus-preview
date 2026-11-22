# FOCUS native iOS roadmap

This document separates capabilities that work in the current GitHub Pages PWA from capabilities that require a native iOS target.

## Available in the PWA

- A compact in-app timer while browsing the overview, calendar, analytics, or Study Room.
- Local study history, optional subject and intention metadata, notes, and JSON export/import.
- Local-only settings and recovery snapshots.
- Weather and Study Room atmosphere while the network is available.

## Native iOS work required

### Home Screen widget
Build a WidgetKit extension with small/medium/large families. The app should write a sanitized timer snapshot and summary data to an App Group container. The widget is a glanceable surface; controls are limited by WidgetKit interaction rules.

### Live Activities and Dynamic Island
Use ActivityKit for a live timer surface. Start/update/end activities from the native app lifecycle, and define clear behavior for pause, resume, completion, and stale activities. A PWA cannot provide a true Dynamic Island Live Activity.

### Device synchronization
Use a signed-in backend or a private CloudKit database. Define a versioned record schema, conflict policy, deletion tombstones, and export/restore before enabling sync. Do not synchronize by exposing a public GitHub Pages endpoint or placing secrets in client code.

### Background reliability and audio
A native app can use iOS-supported background modes only when the use case and App Store policy permit them. Do not promise uninterrupted background execution or audio without device-level validation.

## Suggested native architecture

- SwiftUI shell and navigation
- Shared domain model for timer, sessions, settings, and backup versions
- WidgetKit + ActivityKit extensions
- Local persistence first, with CloudKit or a secured API as an optional sync layer
- Import/export compatibility with the existing FOCUS JSON backup format

The current PWA remains the preview and test surface. Native features should be implemented in a separate iOS project and must not be simulated as if they were fully available in Safari or a Home Screen web app.
