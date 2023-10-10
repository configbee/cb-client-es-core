# Configbee Client Core

Configbee Client Core is a JavaScript client library for integrating your application with Configbee, a feature flags and configuration management service. This library allows you to dynamically manage feature flags and configuration settings in your application.

## Installation

You can include the `configbee-client-core` library in your project using a CDN or by downloading it directly. Here's how you can include it using a CDN:

```html
<script src="https://unpkg.com/configbee-client-core@0.0.2-alpha.1/dist/cb-client-core.min.js"></script>
```

## Usage

### Initialization

Initialize Configbee in your JavaScript code using the `Configbee.init()` method. Provide your Account ID, Project ID, and Environment ID. Additionally, you can specify callbacks for when Configbee is ready and when configuration updates occur.

Example:

```javascript
var cb = Configbee.init({
    accountId: "YOUR_ACCOUNT_ID",
    projectId: "YOUR_PROJECT_ID",
    environmentId: "YOUR_ENVIRONMENT_ID",
    onReady: function() {
        // Code to execute when Configbee is ready
    },
    onUpdate: function() {
        // Code to execute when configuration updates occur
    }
});
```

### Accessing Configuration Data

Once initialized, you can access configuration data using the `cb` object. Here are some examples:

- **Get All Feature Flags**: Retrieve all boolean feature flags.

  ```javascript
  var flags = cb.getAllFlags();
  ```

- **Get All Number Configuration Options**: Retrieve all numerical configuration options.

  ```javascript
  var numbers = cb.getAllNumbers();
  ```

- **Get All Text Configuration Options**: Retrieve all textual configuration options.

  ```javascript
  var texts = cb.getAllTexts();
  ```

- **Get All JSON Configuration Options**: Retrieve all JSON configuration options.

  ```javascript
  var jsons = cb.getAllJsons();
  ```

- **Get Single Feature Flag by Key**: Retrieve the boolean value of a specific feature flag by its key.

  ```javascript
  var flagValue = cb.getFlag('flagKey');
  ```

- **Get Single Number Configuration Option by Key**: Retrieve the numerical value of a specific number configuration option by its key.

  ```javascript
  var numberValue = cb.getNumber('numberKey');
  ```

- **Get Single Text Configuration Option by Key**: Retrieve the textual value of a specific text configuration option by its key.

  ```javascript
  var textValue = cb.getText('textKey');
  ```

- **Get Single JSON Configuration Option by Key**: Retrieve the JSON object of a specific JSON configuration option by its key.

  ```javascript
  var jsonValue = cb.getJson('jsonKey');
  ```

### Handling Updates

Configbee allows you to update feature flags and configuration settings in real-time without requiring a redeployment of your application. When configuration updates occur, the `onUpdate` callback specified during initialization is triggered. Inside this callback, you can react to configuration changes and update your application accordingly.

Example:

```javascript
var cb = Configbee.init({
    // Initialization options
    onUpdate: function() {
        // Code to execute when configuration updates occur
        console.log("Configuration updated");
        // Update application based on new configuration
    }
});
```

## Targeting
Configbee allows you to define target properties to tailor configurations based on specific criteria. You can set target properties either at initialization or using `.setTargetProperties`.

### Initialization with Target Properties
Set target properties during initialization:
```javascript
const cb = Configbee.init({
    accountId: "your_account_id",
    projectId: "your_project_id",
    environmentId: "your_environment_id",
    targetProperties: { "user_id": "1", "utm_campaign": "ph" }
});
```

### Updating Target Properties
Alternatively, set/update target properties after initialization and Clear all target properties using unsetTargetProperties.
```javascript
const cb = Configbee.init({
    accountId: "your_account_id",
    projectId: "your_project_id",
    environmentId: "your_environment_id"
});
cb.setTargetProperties({ "user_id": "2", "utm_campaign": "summer_sale" });
cb.unsetTargetProperties();
```

*Note:* Target properties will be maintained between multiple page loads until the next call of `init` with `targetProperties`, `setTargetProperties`, or `unsetTargetProperties`.


## Resources
- [NOTICE](https://github.com/configbee/cb-client-es-core/blob/main/NOTICE)
- [LICENSE](https://github.com/configbee/cb-client-es-core/blob/main/LICENSE)
