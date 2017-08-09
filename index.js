const signalkSchema = require('signalk-schema')
const Bacon = require('baconjs')
const mung = require('express-mung')
const _ = require('lodash')

const relevantKeys = Object.keys(signalkSchema.metadata)
  .filter(s => s.indexOf('/vessels/*') >= 0)
  .map(s => s.replace('/vessels/*', '').replace(/\//g, '.').replace(/RegExp/g, '*').substring(1)).sort()

module.exports = function(app) {
  var plugin = {}
  var unsubscribes = []

  plugin.id = "zones"
  plugin.name = "Edit & Process Zones"
  plugin.description = "Plugin to edit zones: ranges & associated alerts for values"

  var interceptor = (body, req, res) => body
  var postHandler = (req, res, next) => next()

  app.use(mung.json((body, req, res) => interceptor(body, req, res)))
  app.use((req, res, next) => postHandler(req, res, next))

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

  plugin.start = function(options, saveAndRestart) {
    unsubscribes = (options.zones ||  []).reduce((acc, {
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

    interceptor = (origBody, req, res) => {
      var body = origBody
      if(req.path.indexOf('/signalk/v1/api/') === 0) {
        body = JSON.parse(JSON.stringify(origBody))
        const subPath = req.path.substring('/signalk/v1/api/'.length).split('/')
        if(subPath.length > 0 && subPath[subPath.length - 1] === '') {
          subPath.splice(subPath.length - 1, 1)
        }
        options.zones.forEach(({
          key,
          zones
        }) => {
          var pathToSet = ['vessels', app.selfId].concat(key.split('.')).concat(['meta', 'zones'])
          if(subPath.length > 0 && subPath[0] === 'vessels') {
            pathToSet = pathToSet.splice(1)
            if(subPath.length > 1 && (subPath[1] === app.selfId || subPath[1] === 'self')) {
              pathToSet = pathToSet.splice(1)
              for(var i = 2; i < subPath.length; i++) {
                if(pathToSet[0] === subPath[i]) {
                  pathToSet = pathToSet.splice(1)
                } else {
                  return
                }
              }
            }
          }
          if(pathToSet.length > 0) {
            _.set(body, pathToSet.join('.'), zones)
          } else {
            body = zones
          }
        })
      }
      return body
    }

    postHandler = (req, res, next) => {
      if(req.method === 'POST' && (req.path.startsWith('/signalk/v1/api/vessels/self') ||
          req.path.startsWith('/signalk/v1/api/vessels/' + app.selfId)) && _.endsWith(req.path, '/meta/zones')) {
        const pathParts = req.path.split('/').splice(6)
        pathParts.splice(pathParts.length - 2)
        const key = pathParts.join('.')
        var existingUpdated = false
        options.zones = options.zones.map(keyedZones => {
          if(keyedZones.key === key) {
            existingUpdated = true
            return {
              key: key,
              zones: req.body
            }
          } else {
            return keyedZones
          }
        })
        if(!existingUpdated) {
          options.zones.push({
            key: key,
            zones: req.body
          })
        }
        saveAndRestart(options)

        res.send("OK")
      } else {
        next()
      }
    }

    return true
  }

  plugin.stop = function() {
    unsubscribes.forEach(f => f())
    unsubscribes = []
    interceptor = (body, req, res) => body
    postHandler = (req, res, next) => next()
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
