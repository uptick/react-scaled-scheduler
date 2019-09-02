import React from 'react'
import moment from 'moment'
import { DragSource } from 'react-dnd'
import PropTypes from 'prop-types'
import classNames from 'classnames'
import { nearestTime } from 'event-time-utils'
import { shallowEqual, shallowEqualExcept, shallowItemsDifferExcept } from 'shallow-utils'

const moveSource = {
  beginDrag(props, monitor) {
    return {
      ...props,
      action: 'move',
      grabOffset: props.getDropRealTime() - props.begins,
    }
  },
  endDrag(props, monitor) {
    const item = monitor.getItem()
    const dropResult = monitor.getDropResult()
    if (dropResult === null) {
      return
    }

    let dropRealTime = props.getDropRealTime()
    dropRealTime = nearestTime(dropRealTime - item.grabOffset, props.dropRounding)
    props.onDrop(item, props.rowData, {...dropResult, moveTo: dropRealTime})
  },
}
function moveCollect(connect, monitor) {
  return {
    connectMoveSource: connect.dragSource(),
    connectMovePreview: connect.dragPreview(),
  }
}

const beforeSource = {
  beginDrag(props, monitor) {
    return {
      ...props,
      action: 'beforeDrag',
    }
  },
  endDrag(props, monitor) {
    const item = monitor.getItem()
    const dropResult = monitor.getDropResult()
    if (dropResult === null) {
      return
    }

    let dropRealTime = props.getDropRealTime()
    let newBegins = Math.min(dropRealTime, +item.ends - props.minEventDuration)
    props.onDrop(item, props.rowData, {...dropResult, begins: newBegins})
  },
}
function beforeCollect(connect, monitor) {
  return {
    connectBeforeSource: connect.dragSource(),
    connectBeforePreview: connect.dragPreview(),
  }
}

const afterSource = {
  beginDrag(props, monitor) {
    return {
      ...props,
      action: 'afterDrag',
    }
  },
  endDrag(props, monitor) {
    const item = monitor.getItem()
    const dropResult = monitor.getDropResult()
    if (dropResult === null) {
      return
    }

    let inInterval = dropResult.intervals[Math.floor(dropResult.intervals.length * dropResult.droptime)]
    if (!inInterval) {
      return
    }
    let intervalPosition = dropResult.droptime % (1 / dropResult.intervals.length) * dropResult.intervals.length
    let dropRealTime = +inInterval.begins + ((+inInterval.ends - +inInterval.begins) * intervalPosition)
    dropRealTime = nearestTime(dropRealTime, props.dropRounding)
    let newEnds = Math.max(dropRealTime, +item.begins + props.minEventDuration)
    props.onDrop(item, props.rowData, {...dropResult, ends: newEnds})
  },
}
function afterCollect(connect, monitor) {
  return {
    afterSource: connect.dragSource(),
    connectAfterPreview: connect.dragPreview(),
  }
}

class Event extends React.Component {
  shouldComponentUpdate(nextProps, nextState) {
    let ignoreProps = [
      'dropRealTime',
    ]
    if (!shallowEqualExcept(this.props, nextProps, ignoreProps)) {
      // console.log('misc props changed', shallowItemsDifferExcept(this.props, nextProps, ignoreProps))
      return true
    }

    return false
  }

  handleClick = (event) => {
    if (event) {
      event.preventDefault()
    }
    if (!this.props.clickable || this.props.disabled) {
      return
    }
    this.props.onClick(this.props.id)
  }
  render() {
    // console.log('rendering event')
    let tickrateSecs = `${this.props.dragoverTickrate / 1000}s`
    let style = {
      transition: `width ${tickrateSecs} ${this.props.animTransition}, left ${tickrateSecs} ${this.props.animTransition}, height ${tickrateSecs} ${this.props.animTransition}, top ${tickrateSecs} ${this.props.animTransition}`,
    }
    if (this.props.vertical) {
      style = {
        ...style,
        height: this.props.width,
        maxWidth: this.props.height,
        minWidth: this.props.height,
        left: this.props.top,
        top: this.props.left,
      }
    }
    else {
      style = {
        ...style,
        width: this.props.width,
        maxHeight: this.props.height,
        minHeight: this.props.height,
        top: this.props.top,
        left: this.props.left,
      }
    }

    let beforeHandle
    if (!this.props.pending) {
      beforeHandle = this.props.connectBeforeSource(<span className="resize before" />)
    }

    let afterHandle
    if (!this.props.pending) {
      afterHandle = this.props.afterSource(<span className="resize after" />)
    }

    let propStr
    if (this.props.property) {
      propStr = <span className="property">{this.props.property}</span>
    }

    var contents = (
      <div className="rscales-event-body">
        <div className="rscales-event-contents" style={this.props.style}>
          <span className="title">{this.props.title}</span>
          {this.props.location && (
            <p className="location">{this.props.location.trim()}</p>
          )}
        </div>
        {!this.props.disabled && beforeHandle}
        {!this.props.disabled && afterHandle}
      </div>
    )
    if (!this.props.disabled) { contents = this.props.connectMoveSource(contents) }

    let noPreview = (<span style={{width: 0, height: 0}} />)

    const event = (
      <div
        className={classNames('rscales-event', {
          active: this.props.active,
          hidden: this.props.hidden,
          clickable: this.props.clickable,
          disabled: this.props.disabled,
        }, this.props.extraClasses)}
        style={style}
        onClick={this.handleClick}
      >
        {this.props.connectMovePreview(noPreview)}
        {this.props.connectAfterPreview(noPreview)}
        {this.props.connectBeforePreview(noPreview)}
        {contents}
      </div>
    )
    return (event)
  }
}
Event = DragSource('RSCALES_EVENT', moveSource, moveCollect)(Event)
Event = DragSource('RSCALES_EVENT', beforeSource, beforeCollect)(Event)
Event = DragSource('RSCALES_EVENT', afterSource, afterCollect)(Event)

export default Event
