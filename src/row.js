import React from 'react'
import moment from 'moment'
import { DropTarget } from 'react-dnd'
import { eventsInRange, chronoEventsComparer, stackEvents, nearestTime } from 'event-time-utils'

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
class Row extends React.Component {
  componentDidMount() {
    this.refs.ruler.addEventListener('dragover', this.dragoverEvent);
    this.refs.ruler.addEventListener('mousemove', this.dragoverEvent);
  }
  componentWillUnmount() {
    this.refs.ruler.removeEventListener('dragover', this.dragoverEvent);
    this.refs.ruler.removeEventListener('mousemove', this.dragoverEvent);
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
    const calendarRect = this.refs.ruler.getBoundingClientRect()
    // const calendarWidth = calendarRect.right - calendarRect.left
    // const calendarHeight = calendarRect.bottom - calendarRect.top
    let position = 0
    if (this.props.vertical) {
      position = (event.pageY - calendarRect.top) / calendarRect.height
    }
    else {
      position = (event.pageX - calendarRect.left) / calendarRect.width
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
  adjustedDropItem() {
    let dropRealTime = this.props.intervals[0].begins
    let inInterval = this.props.intervals[Math.floor(this.props.intervals.length * this.props.droptime)]
    if (inInterval) {
      let intervalPosition = this.props.droptime % (1 / this.props.intervals.length) * this.props.intervals.length

      dropRealTime = +inInterval.begins + ((+inInterval.ends - +inInterval.begins) * intervalPosition)
      dropRealTime = nearestTime(dropRealTime, this.props.dropRounding)
    }

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
        />
      )
    })
  }
  render() {
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
    return (
      <div
        className="rscales-row"
        style={style}
      >
        {this.props.showTitle && (
          <div className="rscales-title">
            {'title' in this.props && (
              <h2>{this.props.title}</h2>
            )}
          </div>
        )}
        <div className="rscales-data" ref="ruler">
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
Row = DropTarget([
  'RSCALES_EVENT',
], rowSource, rowCollector)(Row)

export default Row
