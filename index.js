const signalkSchema = require('signalk-schema')
const Bacon = require('baconjs')

const relevantKeys = Object.keys(signalkSchema.metadata)
  .filter(s => s.indexOf('/vessels/*') >= 0)
  .map(s => s.replace('/vessels/*', '').replace(/\//g, '.').replace(/RegExp/g, '*').substring(1))

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
          type: "object",
          properties: {
            "key": {
              title: "Signal K key",
              type: "string",
              default: "",
              "enum": relevantKeys
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

  plugin.start = function(options) {
    unsubscribes = options.zones.reduce((acc, {
      key,
      zones
    }) => {
      var stream = app.streambundle.getSelfStream(key)
      zones.forEach(zone => {
        var valueTest
        if(typeof zone.upper != 'undefined') {
          if(typeof zone.lower != 'undefined') {
            valueTest = value => value < zone.upper && value > zone.lower
          } else {
            valueTest = value => value < zone.upper
          }
        } else {
          valueTest = value => value > zone.upper
        }
        if(valueTest) {
          const inZone = stream.map(value => valueTest(value)).skipDuplicates()
          acc.push(inZone.onValue(inZone => raiseNotification(key, zone, inZone)))
        }
      })
      return acc
    }, [])
    return true
  }

  plugin.stop = function() {
    unsubscribes.forEach(f => f())
    unsubscribes = []
  }

  function raiseNotification(key, zone, inZone) {
    const delta = {
      context: "vessels." + app.selfId,
      updates: [
        {
          source: {
            label: "self.notificationhandler"
          },
          values: [{
            path: "notifications." + key,
            value: inZone ? {
              state: zone.state,
              message: zone.message,
              timestamp: (new Date()).toISOString()
            } : null
            }]
        }
      ]
    }
    app.signalk.addDelta(delta)
  }

  return plugin
}
