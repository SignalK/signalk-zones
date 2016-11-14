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
          title: "Zones for one Path",
          type: "object",
          properties: {
            "active": {
              title: "Active",
              type: "boolean",
              default: true
            },
            "key": {
              title: "Signal K Path",
              type: "string",
              default: "",
              "enum": relevantKeys
            },
            "zones": {
              "type": "array",
              "title": " ",
              "description": "Add one or more zones ",
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
      active,
      zones,
    }) => {
      if(active) {
        var stream = app.streambundle.getSelfStream(key)
        const tests = zones.map((zone, i) => {
          if(typeof zone.upper != 'undefined') {
            if(typeof zone.lower != 'undefined') {
              return value => value < zone.upper && value > zone.lower
            } else {
              return value => value < zone.upper
            }
          } else {
            return value => value > zone.upper
          }
        })
        acc.push(stream.map(value => {
          return tests.findIndex(test => test(value))
        }).skipDuplicates().scan([], (zonesChanged, zoneIndex) => {
          zonesChanged.unshift(zoneIndex)
          zonesChanged.splice(2)
          return zonesChanged
        }).onValue(zonesChanged => {
          if(zonesChanged.length > 0) {
            raiseNotification(key, zonesChanged[0], zones, true)
            if(zonesChanged.length > 1 && zonesChanged[1] >= 0 ) {
              raiseNotification(key, zonesChanged[1], zones, false)
            }
          }
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

  function raiseNotification(key, zoneIndex, zones, inZone) {
    if(zoneIndex >= 0) {
      const zone = zones[zoneIndex]
      const delta = {
        context: "vessels." + app.selfId,
        updates: [
          {
            source: {
              label: "self.notificationhandler"
            },
            values: [{
              path: "notifications." + key,
              value: {
                state: inZone && zoneIndex >= 0 ? zone.state : "normal",
                message: inZone ? zone.message : null,
                timestamp: (new Date()).toISOString()
              }
            }]
        }
      ]
      }
      app.signalk.addDelta(delta)
    }
  }

  return plugin
}
