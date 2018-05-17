import React from 'react'
import moment from 'moment'
import classNames from 'classnames'

import Corner from './corner.js'

class Header extends React.Component {
  render() {
    return (
      <div className="rscales-header">
        {this.props.showTitle && (
          <div className="rscales-title">{this.props.children}</div>
        )}
        <div className="rscales-data">
          {this.props.intervals.map((interval) => {
            let title
            if (typeof this.props.titleFormat === 'function') {
              title = this.props.titleFormat(interval)
            }
            else {
              title = moment(interval.begins, 'x').format(this.props.titleFormat)
            }
            return (
              <div key={`interval-${interval.begins}`}>
                <h3>{title}</h3>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
}

class Scheduler extends React.Component {
  constructor(props) {
    super(props)

    this.state = {
      ...this.state,
      droptime: 0,
    }
  }

  updateDroptime = (droptime) => {
    this.setState({droptime: droptime})
  }

  render() {
    const corners = []
    const children = []
    React.Children.map(this.props.children, (child) => {
      if (child && 'type' in child && child.type == Corner) {
        corners.push(child)
        return
      }
      children.push(React.cloneElement(child, {
        vertical: this.props.vertical,
        dropRounding: this.props.dropRounding,
        showTitle: this.props.showTitles,
        intervals: this.props.intervals,
        minEventDuration: this.props.minEventDuration,
        dragoverDebounce: this.props.dragoverDebounce,
        dragoverTickrate: this.props.dragoverTickrate,
        animTransition: this.props.animTransition,
        eventMargin: this.props.eventMargin,
        eventHeight: this.props.eventHeight,

        droptime: this.state.droptime,

        updateDroptime: this.updateDroptime,
        onEventDrop: this.props.onEventDrop,
        onEventClick: this.props.onEventClick,
      }))
    })
    return (
      <div className={classNames('rscales-root', {
        'vertical': this.props.vertical,
      })} style={this.props.style}>
        <Header
          vertical={this.props.vertical}
          showTitle={this.props.showTitles}
          intervals={this.props.intervals}
          titleFormat={this.props.headerTitleFormat}
        >
          {corners}
        </Header>
        <div className="rscales-body">
          {children}
        </div>
      </div>
    )
  }
}
Scheduler.defaultProps = {
  style: {},
  vertical: false,
  showTitles: true,
  dropRounding: moment.duration({minutes: 15}),
  headerTitleFormat: 'ha',
  minEventDuration: moment.duration({minutes: 15}),
  dragoverDebounce: 50,
  dragoverTickrate: 200,
  animTransition: 'ease-out',
  eventMargin: 5,
  eventHeight: 16 * 2 + 10,
  onEventDrop: function(event, rowData, dropData) {
    console.log('RScaleS: dropped rscales event', event, 'at', rowData, dropData)
  },
  onEventClick: function(event) {
    console.log('RScaleS: clicked rscales event', event)
  },
}

export default Scheduler
