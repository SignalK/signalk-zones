const signalkSchema = require('@signalk/signalk-schema')
const Bacon = require('baconjs')

const relevantKeys = Object.keys(signalkSchema.metadata)
  .filter(s => s.indexOf('/vessels/*') >= 0)
  .map(s => s.replace('/vessels/*', '').replace(/\//g, '.').replace(/RegExp/g, '*').substring(1)).sort()

module.exports = function(app) {
  var plugin = {}
  var unsubscribes = []

  plugin.id = "zones-edit"
  plugin.name = "Edit Zones"
  plugin.description = "Plugin to edit zones: set ranges for gauges and different zones"

  plugin.schema = {
    type: "object",
    properties: {
      zones: {
        type: "array",
        title: " ",
        items: {
          title: "One Signal K path with zones (zone = upper and lower limit with metadata)",
          type: "object",
          properties: {
            "active": {
              title: "Active",
              type: "boolean",
              default: true
            },
            "key": {
              title: "Path",
              type: "string",
              default: "",
              "enum": relevantKeys
            },
            "zones": {
              "type": "array",
              "title": " ",
              "description": "Zones",
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

                  "method": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "enum": ["visual", "sound"]
                    },
                    default: ["visual", "sound"]
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

  plugin.start = function(options) {
    unsubscribes = (options.zones || []).reduce((acc, {
      key,
      active,
      zones,
    }) => {
      if(active) {
        var stream = app.streambundle.getSelfStream(key)
        const tests = zones.map((zone, i) => {
          if(typeof zone.upper != 'undefined') {
            if(typeof zone.lower != 'undefined') {
              return value => value < zone.upper && value >= zone.lower
            } else {
              return value => value < zone.upper
            }
          } else {
            return value => value > zone.upper
          }
        })
        acc.push(stream.map(value => {
          return tests.findIndex(test => test(value))
        }).skipDuplicates().onValue(zoneIndex => {
          sendNotificationUpdate(key, zoneIndex, zones)
        }))
      }
      return acc
    }, [])
    return true
  }

  plugin.stop = function() {
    unsubscribes.forEach(f => f())
    unsubscribes = []
  }

  function sendNotificationUpdate(key, zoneIndex, zones) {
    var value = null
    if(zoneIndex >= 0) {
      const zone = zones[zoneIndex]
      value = {
        state: zone.state,
        message: zone.message ||  zone.lower + ' < value < ' + zone.upper,
        method: zone.method,
        timestamp: (new Date()).toISOString()
      }
    }
    const delta = {
      context: "vessels." + app.selfId,
      updates: [
        {
          source: {
            label: "self.notificationhandler"
          },
          values: [{
            path: "notifications." + key,
            value: value
          }]
        }
      ]
    }
    app.signalk.addDelta(delta)
  }

  return plugin
}
