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

                  "method": {
                    "type": "array",
                    "items": {
                      "type": "string",
                      "enum": ["visual", "sound"]
                    }
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

  plugin.registerWithRouter = function(router) {
    router.post("/silenceNotification", (req, res) => {

      notification = req.body
      if ( typeof notification.path == 'undefined' )
      {
        debug("invalid request: " + util.inspect(notification, {showHidden: false, depth: 1}))
        res.status(400)
        res.send("Invalid Request")
        return
      }

      var existing = _.get(app.signalk.self, notification.path)
      if ( existing.method != null
           && typeof existing.method != "undefined"
           && existing.method.indexOf("sound") != -1 )
        {
          existing.methods = existing.filter(function(method) { return method != "sound" })
          existing.timestamp = (new Date()).toISOString()
          
          const delta = {
          context: "vessels." + app.selfId,
          updates: [
            {
            source: {
              label: "self.notificationhandler"
            },
            values: [{
                path: "notifications." + key,
                value: existing
                }]
            }
                    ]
          }
          app.signalk.addDelta(delta)
        }
    })
  }
  

  plugin.stop = function() {
    unsubscribes.forEach(f => f())
    unsubscribes = []
  }

  function sendNotificationUpdate(key, zoneIndex, zones) {
    var value = null
    if(zoneIndex >= 0) {
      value = {
        state: zones[zoneIndex].state,
        message: zones[zoneIndex].message,
        timestamp: (new Date()).toISOString()
      }
          
      if ( value.state != "normal" )
        value.method = [ "visual", "sound" ]
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
