import React from 'react'

class Corner extends React.Component {
  render() {
    if (this.props.children && this.props.children.length) {
      return (
        <div>
          {this.props.children}
        </div>
      )
    }
    return (this.props.children || null)
  }
}

export default Corner
