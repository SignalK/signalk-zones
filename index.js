// const streamBundle = require('../streambundle');
// const debug = require('debug')('signalk-server:interfaces:setSystemDateTime');

module.exports = function(app) {
  var plugin = {
    unsubscribes: []
  };

  plugin.id = "zones-edit"
  plugin.name = "Edit Zones"
  plugin.description = "Plugin to edit zones: set ranges for gauges and different zones"

  plugin.schema = {
    type: "object",
    title: "Zones",
    properties: {
      zones: {
        type: "array",
        items: {
          type: "object",
          properties: {
            "key": {
              title: "Signal K key",
              type: "string",
              default: "",
              "enum": ["navigation.courseOverGroundTrue", "navigation.speedThroughWater"]
            },
            "zones": {
              "type": "array",
              "title": "Zones for a Key",
              "description": "The zones defining the ranges of values for a Signal K key.",
              "items": {
                "type": "object",
                "title": "Zone",
                "required": ["state"],
                "properties": {
                  "lower": {
                    "id": "lower",
                    "type": "number",
                    "title": "Lower",
                    "description": "The lowest value in this zone",
                    "name": "lower"
                  },

                  "upper": {
                    "id": "upper",
                    "type": "number",
                    "title": "Upper",
                    "description": "The highest value in this zone",
                    "name": "upper"
                  },

                  "state": {
                    "type": "string",
                    "title": "Alarm State",
                    "description": "The alarm state when the value is in this zone.",
                    "default": "normal",
                    "enum": ["normal", "alert", "warn", "alarm", "emergency"]
                  },

                  "message": {
                    "id": "message",
                    "type": "string",
                    "title": "Message",
                    "description": "The message to display for the alarm.",
                    "default": ""
                  }
                }
              }
            }
          }
        }
      }
    }
  }
  plugin.start = function() {
    return true
  }

  plugin.stop = function() {
    plugin.unsubscribes.forEach(f => f())
  }

  return plugin
}
