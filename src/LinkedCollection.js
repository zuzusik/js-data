import {
  classCallCheck,
  extend,
  get,
  getSuper,
  isArray,
  isFunction,
  isObject,
  isString,
  isUndefined,
  set
} from './utils'
import {
  belongsToType,
  hasManyType,
  hasOneType
} from './decorators'
import Collection from './Collection'

/**
 * TODO
 *
 * ```javascript
 * import {LinkedCollection} from 'js-data'
 * ```
 *
 * @class LinkedCollection
 * @extends Collection
 * @param {Array} [records] Initial set of records to insert into the
 * collection. See {@link Collection}.
 * @param {Object} [opts] Configuration options. See {@link Collection}.
 * @return {Mapper}
 */
const LinkedCollection = Collection.extend({
  constructor (records, opts) {
    const self = this
    classCallCheck(self, LinkedCollection)

    getSuper(self).call(self, records, opts)

    // Make sure this collection has somewhere to store "added" timestamps
    self._added = {}

    // Make sure this collection a reference to a datastore
    if (!self.datastore) {
      throw new Error('This collection must have a datastore!')
    }
    return self
  },

  _onRecordEvent (...args) {
    const self = this
    getSuper(self).prototype._onRecordEvent.apply(self, args)
    const event = args[0]
    // This is a very brute force method
    // Lots of room for optimization
    if (isString(event) && event.indexOf('change') === 0) {
      self.updateIndexes(args[1])
    }
  },

  add (records, opts) {
    const self = this
    const datastore = self.datastore
    const mapper = self.mapper
    const relationList = mapper.relationList || []
    const timestamp = new Date().getTime()
    const usesRecordClass = !!mapper.RecordClass
    let singular

    if (isObject(records) && !isArray(records)) {
      singular = true
      records = [records]
    }

    if (relationList.length && records.length) {
      // Check the currently visited record for relations that need to be
      // inserted into their respective collections.
      mapper.relationList.forEach(function (def) {
        const relationName = def.relation
        // A reference to the Mapper that this Mapper is related to
        const Relation = datastore.getMapper(relationName)
        // The field used by the related Mapper as the primary key
        const relationIdAttribute = Relation.idAttribute
        // Grab the foreign key in this relationship, if there is one
        const foreignKey = def.foreignKey
        const localField = def.localField
        // A lot of this is an optimization for being able to insert a lot of
        // data as quickly as possible
        const relatedCollection = datastore.getCollection(relationName)
        const type = def.type
        const isBelongsTo = type === belongsToType
        const isHasMany = type === hasManyType
        const isHasOne = type === hasOneType
        const idAttribute = mapper.idAttribute
        const shouldAdd = isUndefined(def.add) ? true : !!def.add
        let relatedData

        records.forEach(function (record) {
          // Grab a reference to the related data attached or linked to the
          // currently visited record
          relatedData = get(record, localField)

          if (isFunction(def.add)) {
            def.add(datastore, def, record)
          } else if (relatedData) {
            const id = get(record, idAttribute)
            // Otherwise, if there is something to be added, add it
            if (isHasMany) {
              // Handle inserting hasMany relations
              relatedData = relatedData.map(function (toInsertItem) {
                // Check that this item isn't the same item that is already in the
                // store
                if (toInsertItem !== relatedCollection.get(relatedCollection.recordId(toInsertItem))) {
                  // Make sure this item has its foreignKey
                  if (foreignKey) {
                    set(toInsertItem, foreignKey, id)
                  }
                  // Finally add this related item
                  if (shouldAdd) {
                    toInsertItem = relatedCollection.add(toInsertItem)
                  }
                }
                return toInsertItem
              })
              // If it's the parent that has the localKeys
              if (def.localKeys) {
                set(record, def.localKeys, relatedData.map(function (inserted) {
                  return get(inserted, relationIdAttribute)
                }))
              }
            } else {
              const relatedDataId = get(relatedData, relationIdAttribute)
              // Handle inserting belongsTo and hasOne relations
              if (relatedData !== relatedCollection.get(relatedDataId)) {
                // Make sure foreignKey field is set
                if (isBelongsTo) {
                  set(record, foreignKey, relatedDataId)
                } else if (isHasOne) {
                  set(relatedData, foreignKey, id)
                }
                // Finally insert this related item
                if (shouldAdd) {
                  relatedData = relatedCollection.add(relatedData)
                }
              }
            }
            set(record, localField, relatedData)
          }
        })
      })
    }

    records = getSuper(self).prototype.add.call(self, records, opts)

    records.forEach(function (record) {
      // Track when this record was added
      self._added[self.recordId(record)] = timestamp

      if (usesRecordClass) {
        record._set('$', timestamp)
      }
    })

    return singular ? records[0] : records
  },

  remove (id, opts) {
    const self = this
    delete self._added[id]
    const record = getSuper(self).prototype.remove.call(self, id, opts)
    if (record) {
      const mapper = self.mapper
      if (mapper.RecordClass) {
        record._set('$') // unset
      }
    }
    return record
  },

  removeAll (query, opts) {
    const self = this
    const records = getSuper(self).prototype.removeAll.call(self, query, opts)
    records.forEach(function (record) {
      delete self._added[self.recordId(record)]
    })
    return records
  }
})

/**
 * Create a LinkedCollection subclass.
 *
 * ```javascript
 * var MyLinkedCollection = LinkedCollection.extend({
 *   foo: function () { return 'bar' }
 * })
 * var collection = new MyLinkedCollection()
 * collection.foo() // "bar"
 * ```
 *
 * @name LinkedCollection.extend
 * @method
 * @param {Object} [props={}] Properties to add to the prototype of the
 * subclass.
 * @param {Object} [classProps={}] Static properties to add to the subclass.
 * @return {Function} Subclass of LinkedCollection.
 */
LinkedCollection.extend = extend

export {
  LinkedCollection as default
}
