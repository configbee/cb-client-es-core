# Configbee Client Core

JavaScript client library for Configbee – Dynamic feature flags and configuration management.

[Website](https://configbee.com) | [Documentation](https://docs.configbee.com) | [JavaScript SDK Docs](https://docs.configbee.com/client-sdks/javascript/)

## About

Configbee Client Core is a JavaScript client library that integrates your application with Configbee, a feature‑flags and configuration‑management service. It enables dynamic management of feature flags and configuration settings within your application.

### Key Features

- 🚀 Simple initialization with `Configbee.init`
- 🎯 Targeting support (`setTargetProperties`, `unsetTargetProperties`)
- 🔄 Real‑time updates via callbacks
- 📊 Supports flags, numbers, texts, and JSON values
- ⚡ Small bundle size, works with CDN or npm

## Installation

Include via CDN (replace version as needed):

```html
<script src="https://unpkg.com/configbee-client-core@0.0.3/dist/cb-client-core.min.js"></script>
```

Or install with npm/yarn:

```bash
npm install configbee-client-core
# or
yarn add configbee-client-core
```

## Usage

> 💡 **For the most up-to-date documentation, visit [docs.configbee.com/client-sdks/javascript/](https://docs.configbee.com/client-sdks/javascript/)**

### Initialization

```js
var cb = Configbee.init({
  accountId: "YOUR_ACCOUNT_ID",
  projectId: "YOUR_PROJECT_ID",
  environmentId: "YOUR_ENVIRONMENT_ID",
  onReady: function () {
    // ready
  },
  onUpdate: function () {
    // handle updates
  },
});
```

### Accessing Configuration Data

```js
var flags = cb.getAllFlags();      // all boolean flags
var numbers = cb.getAllNumbers();  // all numeric configs
var texts = cb.getAllTexts();      // all text configs
var jsons = cb.getAllJsons();      // all JSON configs

var flag = cb.getFlag('flagKey');
var number = cb.getNumber('numberKey');
var text = cb.getText('textKey');
var json = cb.getJson('jsonKey');
```

### Targeting

```js
cb.setTargetProperties({ userId: "123", campaign: "summer" });
cb.unsetTargetProperties();
```

## Documentation

Full API reference, guides, and advanced usage are available at:

https://docs.configbee.com/client-sdks/javascript/

## Resources
- [NOTICE](https://github.com/configbee/cb-client-es-core/blob/main/NOTICE)
- [LICENSE](https://github.com/configbee/cb-client-es-core/blob/main/LICENSE)
