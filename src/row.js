import React from 'react'
import moment from 'moment'
import { DropTarget } from 'react-dnd'
import { eventsInRange, chronoEventsComparer, stackEvents, nearestTime, activeTime } from 'event-time-utils'
import { shallowEqual, shallowEqualExcept, shallowItemsDifferExcept } from 'shallow-utils'
import PropTypes from 'prop-types'

import Event from './event.js'

const EVENT_HANDLE_OFFS = 10
const EVENT_ROW_MARGIN = 0
const EVENT_STACK_SEP = 8

const rowSource = {
  drop(props, monitor) {
    if (monitor.didDrop()) {
      return
    }
    return {
      droptime: props.droptime,
      intervals: props.intervals,
      rowData: props.rowData,
    }
  },
  canDrop(props, monitor) {
    const item = monitor.getItem()
    if (item.action == 'move') {
      return true
    }
    var foundEvent = false
    props.events.map((event) => {
      if (event.id == item.id) {
        foundEvent = true
      }
    })
    return foundEvent
  }
}
function rowCollector(connect, monitor) {
  return {
    connectDropTarget: connect.dropTarget(),
    isOver: monitor.isOver(),
    canDrop: monitor.canDrop(),
    dropItem: monitor.getItem(),
    dropItemType: monitor.getItemType(),
  }
}

function SimpleHeading(props) {
  return (
    <h2>{props.title}</h2>
  )
}

class Row extends React.Component {
  constructor() {
    super();
    this.rulerRef = React.createRef();
  }

  static defaultProps = {
    titleRenderer: SimpleHeading,
  }

  static propTypes = {
    dragoverEvent: PropTypes.any,
    droptime: PropTypes.any,
    events: PropTypes.any,
    rowData: PropTypes.object,
    intervals: PropTypes.any,
    dropItem: PropTypes.any,
    title: PropTypes.string,
    titleRenderer: PropTypes.func,
    canDrop: PropTypes.bool,
    isOver: PropTypes.bool,
    vertical: PropTypes.any,
    lastDropCalc: PropTypes.any,
    dragoverTickrate: PropTypes.any,
  }
  
  componentDidMount() {
    this.rulerRef.current.addEventListener('dragover', this.dragoverEvent)
    this.rulerRef.current.addEventListener('mousemove', this.dragoverEvent)
  }

  componentWillUnmount() {
    this.rulerRef.current.removeEventListener('dragover', this.dragoverEvent)
    this.rulerRef.current.removeEventListener('mousemove', this.dragoverEvent)
  }
  
  shouldComponentUpdate(nextProps, nextState) {
    let nextActive = (nextProps.isOver && nextProps.canDrop)
    let currentlyActive = (this.props.isOver && this.props.canDrop)

    if (currentlyActive != nextActive) {
      // console.log('dnd active state changed')
      return true
    }
    else if (currentlyActive) {
      if (this.props.droptime != nextProps.droptime) {
        // console.log('droptime changed')
        return true
      }
    }

    if (!shallowEqual(this.props.events, nextProps.events)) {
      // console.log('events changed')
      return true
    }
    if (!shallowEqual(this.props.rowData, nextProps.rowData)) {
      // console.log('rowData changed')
      return true
    }
    if (!shallowEqual(this.props.intervals, nextProps.intervals)) {
      // console.log('intervals changed')
      return true
    }

    let ignoreProps = [
      'droptime',
    ]
    let checkedProps = [
      'events',
      'rowData',
      'intervals',
    ]
    if (!shallowEqualExcept(this.props, nextProps, checkedProps.concat(ignoreProps))) {
      // console.log('misc props changed', shallowItemsDifferExcept(this.props, nextProps, checkedProps.concat(ignoreProps)))
      return true
    }

    return false
  }

  dragoverEvent = (event) => {
    const since = (new Date()).getTime() - this.props.lastDropCalc
    if (since < this.props.dragoverTickrate) {
      this.setState(state => {
        if ('droptimeDebounce' in this) {
          window.clearTimeout(this.droptimeDebounce)
        }
        this.droptimeDebounce = window.setTimeout(() => {
          this.updateDroptime(event)
        }, this.props.dragoverDebounce)
        return state
      })
      return
    }
    this.updateDroptime(event)
  }
  updateDroptime(event) {
    const calendarRect = this.rulerRef.current.getBoundingClientRect()
    let position = 0
    if (this.props.vertical) {
      position = (event.clientY - calendarRect.top) / calendarRect.height
    }
    else {
      position = (event.clientX - calendarRect.left) / calendarRect.width
    }
    if (position > 1) {
      position = 1
    }
    else if (position < 0) {
      position = 0
    }

    if ('droptimeDebounce' in this) {
      window.clearTimeout(this.droptimeDebounce)
      delete this.droptimeDebounce
    }

    this.props.updateDroptime(position)
  }
  getDropRealTime = () => {
    let time = this.props.intervals[0].begins
    let inInterval = this.props.intervals[Math.floor(this.props.intervals.length * this.props.droptime)]
    if (inInterval) {
      let intervalPosition = this.props.droptime % (1 / this.props.intervals.length) * this.props.intervals.length

      time = +inInterval.begins + ((+inInterval.ends - +inInterval.begins) * intervalPosition)
    }
    return time
  }
  adjustedDropItem() {
    let dropRealTime = this.getDropRealTime()
    if ('grabOffset' in this.props.dropItem) {
      dropRealTime -= this.props.dropItem.grabOffset
    }
    dropRealTime = nearestTime(dropRealTime, this.props.dropRounding)

    let changedEvent = {
      ...this.props.dropItem,
      active: true,
    }
    switch (changedEvent.action) {
      case 'move':
        const previousDuration = +changedEvent.ends - +changedEvent.begins
        changedEvent.begins = dropRealTime
        changedEvent.ends = +changedEvent.begins + previousDuration
        break
      case 'beforeDrag':
        changedEvent.begins = Math.min(dropRealTime, changedEvent.ends - this.props.minEventDuration)
        break
      case 'afterDrag':
        changedEvent.ends = Math.max(dropRealTime, changedEvent.begins + this.props.minEventDuration)
        break
    }
    return changedEvent
  }
  handleEventClick = (eventId) => {
    let foundEvent
    this.props.events.map((event) => {
      if (event.id == eventId) {
        foundEvent = event
      }
    })
    if (foundEvent && this.props.onEventClick !== null) {
      this.props.onEventClick(foundEvent)
    }
  }

  renderEvents(stackedEvents, intervals) {
    const isActive = (this.props.isOver && this.props.canDrop)
    return stackedEvents.map((event) => {
      let beginsInterval, beginsIndex
      let endsInterval, endsIndex
      intervals.map((interval, intervalIndex) => {
        if (event.begins >= interval.begins && event.begins < interval.ends) {
          beginsInterval = interval
          beginsIndex = intervalIndex
        }
        if (event.ends >= interval.begins && event.ends < interval.ends) {
          endsInterval = interval
          endsIndex = intervalIndex
        }
      })

      let left = beginsIndex
      if (typeof left === 'undefined') {
        left = 0
      } else {
        left += (event.begins - beginsInterval.begins) / (beginsInterval.ends - beginsInterval.begins)
        left = left / intervals.length
      }
      left = Math.max(left, 0)
      let right = endsIndex
      if (typeof right === 'undefined') {
        right = 1
      } else {
        right += (event.ends - endsInterval.begins) / (endsInterval.ends - endsInterval.begins)
        right = right / intervals.length
      }
      right = Math.min(right, 100)

      const width = right - left
      let height = Math.max(this.props.eventHeight - event.stackIndex * EVENT_STACK_SEP, 25)
      let top = this.props.eventHeight + this.props.eventMargin * 2 - height - this.props.eventMargin
      return (
        <Event
          key={`event-${event.id}`}
          className="event"

          {...event}

          width={`${width * 100}%`}
          height={`${height}px`}
          top={`${top}px`}
          left={`${left * 100}%`}

          vertical={this.props.vertical}
          dropRounding={this.props.dropRounding}
          dragoverDebounce={this.props.dragoverDebounce}
          dragoverTickrate={this.props.dragoverTickrate}
          animTransition={this.props.animTransition}
          minEventDuration={this.props.minEventDuration}
          clickable={this.props.onEventClick !== null}
          onClick={this.handleEventClick}
          onDrop={this.props.onEventDrop}
          getDropRealTime={this.getDropRealTime}
          rowData={this.props.rowData}
        />
      )
    })
  }
  render() {
    // console.log('rendering row')
    let intervalSetBegins = +this.props.intervals[0].begins
    let intervalSetEnds = +this.props.intervals[this.props.intervals.length - 1].ends

    const isActive = (this.props.isOver && this.props.canDrop)

    let events = []
    let dropId = this.props.dropItem ? this.props.dropItem.id : null
    let foundDropEvent = false
    this.props.events.map((event) => {
      if (dropId && event.id == dropId) {
        foundDropEvent = true
        if (isActive) {
          events.push(this.adjustedDropItem())
        }
        else {
          let changedEvent = {
            ...event,
          }
          if (this.props.dropItem.action == 'move') {
            changedEvent = this.adjustedDropItem()
            changedEvent.hidden = true
          }
          events.push(changedEvent)
        }
      }
      else {
        events.push(event)
      }
    })
    if (isActive && !foundDropEvent && this.props.dropItem.action == 'move') {
      events.push(this.adjustedDropItem())
    }

    events = eventsInRange(events, intervalSetBegins, intervalSetEnds)
    const stackedEvents = stackEvents(events.sort(chronoEventsComparer), EVENT_ROW_MARGIN)
    let style = {}
    if (this.props.vertical) {
      style.flexBasis = `${this.props.eventHeight + this.props.eventMargin * 2}px`
    }
    else {
      style.height = `${this.props.eventHeight + this.props.eventMargin * 2}px`
    }

    let title
    if (this.props.title && this.props.titleRenderer) {
      title = <this.props.titleRenderer title={this.props.title} />
    }

    return (
      <div
        className="rscales-row"
        style={style}
      >
        {this.props.showTitle && (
          <div className="rscales-title">
            {title}
            {this.props.showActiveTime && (<span className="hours">{activeTime(this.props.events, intervalSetBegins, intervalSetEnds) + 'h'}</span>)}
          </div>
        )}
        <div className="rscales-data" ref={this.rulerRef}>
          {this.props.connectDropTarget(
            <div className="rscales-dropzone">
              {this.renderEvents(stackedEvents, this.props.intervals)}
            </div>
          )}
        </div>
      </div>
    )
  }
}
Row = DropTarget(
  // (props) => {
  //   return ['RSCALES_EVENT'].concat(props.customDropTypes)
  // },
  ['RSCALES_EVENT', 'SCHEDULER_TASK'],
  rowSource,
  rowCollector
)(Row)

export default Row
