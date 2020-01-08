// Libraries
import $ from 'jquery';
import React, { PureComponent } from 'react';
import uniqBy from 'lodash/uniqBy';
// Types
import { TimeRange, GraphSeriesXY, TimeZone, DefaultTimeZone, createDimension } from '@grafana/data';
import _ from 'lodash';
import { FlotPosition, FlotItem } from './types';
import { TooltipProps, TooltipContentProps, ActiveDimensions, Tooltip } from '../Chart/Tooltip';
import { GraphTooltip } from './GraphTooltip/GraphTooltip';
import { GraphDimensions } from './GraphTooltip/types';

export interface GraphProps {
  children?: JSX.Element | JSX.Element[];
  series: GraphSeriesXY[];
  timeRange: TimeRange; // NOTE: we should aim to make `time` a property of the axis, not force it for all graphs
  timeZone?: TimeZone; // NOTE: we should aim to make `time` a property of the axis, not force it for all graphs
  showLines?: boolean;
  showPoints?: boolean;
  showBars?: boolean;
  width: number;
  height: number;
  isStacked?: boolean;
  lineWidth?: number;
  onHorizontalRegionSelected?: (from: number, to: number) => void;
}

interface GraphState {
  pos?: FlotPosition;
  contextPos?: FlotPosition;
  isTooltipVisible: boolean;
  isContextVisible: boolean;
  activeItem?: FlotItem<GraphSeriesXY>;
  contextItem?: FlotItem<GraphSeriesXY>;
}

export class Graph extends PureComponent<GraphProps, GraphState> {
  static defaultProps = {
    showLines: true,
    showPoints: false,
    showBars: false,
    isStacked: false,
    lineWidth: 1,
  };

  state: GraphState = {
    isTooltipVisible: false,
    isContextVisible: false,
  };

  element: HTMLElement | null = null;
  $element: any;

  componentDidUpdate(prevProps: GraphProps, prevState: GraphState) {
    if (prevProps !== this.props) {
      this.draw();
    }
  }

  componentDidMount() {
    this.draw();
    if (this.element) {
      this.$element = $(this.element);
      this.$element.bind('plotselected', this.onPlotSelected);
      this.$element.bind('plothover', this.onPlotHover);
      this.$element.bind('plotclick', this.onPlotClick);
    }
  }

  componentWillUnmount() {
    this.$element.unbind('plotselected', this.onPlotSelected);
  }

  onPlotSelected = (event: JQueryEventObject, ranges: { xaxis: { from: number; to: number } }) => {
    const { onHorizontalRegionSelected } = this.props;
    if (onHorizontalRegionSelected) {
      onHorizontalRegionSelected(ranges.xaxis.from, ranges.xaxis.to);
    }
  };

  onPlotHover = (event: JQueryEventObject, pos: FlotPosition, item?: FlotItem<GraphSeriesXY>) => {
    this.setState({
      isTooltipVisible: true,
      activeItem: item,
      pos,
    });
  };

  onPlotClick = (event: JQueryEventObject, contextPos: FlotPosition, item?: FlotItem<GraphSeriesXY>) => {
    this.setState(state => {
      return {
        isContextVisible: true,
        contextItem: item,
        contextPos,
      };
    });
  };

  getYAxes(series: GraphSeriesXY[]) {
    if (series.length === 0) {
      return [{ show: true, min: -1, max: 1 }];
    }
    return uniqBy(
      series.map(s => {
        const index = s.yAxis ? s.yAxis.index : 1;
        const min = s.yAxis && !isNaN(s.yAxis.min as number) ? s.yAxis.min : null;
        const tickDecimals = s.yAxis && !isNaN(s.yAxis.tickDecimals as number) ? s.yAxis.tickDecimals : null;
        return {
          show: true,
          index,
          position: index === 1 ? 'left' : 'right',
          min,
          tickDecimals,
        };
      }),
      yAxisConfig => yAxisConfig.index
    );
  }

  renderTooltip = (isContextTooltip?: boolean) => {
    const { children, series } = this.props;
    const { pos, contextPos, activeItem, contextItem, isTooltipVisible, isContextVisible } = this.state;
    let tooltipElement: React.ReactElement<TooltipProps> | null = null;
    const isVisible = isContextTooltip ? isContextVisible : isTooltipVisible;
    const position = isContextTooltip ? contextPos : pos;
    const item = isContextTooltip ? contextItem : activeItem;

    if (!isVisible || !position || series.length === 0) {
      return null;
    }

    // Find children that indicate tooltip to be rendered
    React.Children.forEach(children, c => {
      // We have already found tooltip
      if (tooltipElement) {
        return;
      }
      // @ts-ignore
      const childType = c && c.type && (c.type.displayName || c.type.name);

      if (childType === Tooltip.displayName) {
        tooltipElement = c as React.ReactElement<TooltipProps>;
      }
    });
    // If no tooltip provided, skip rendering
    if (!tooltipElement) {
      return null;
    }
    const tooltipElementProps = (tooltipElement as React.ReactElement<TooltipProps>).props;

    const tooltipMode = tooltipElementProps.mode || 'single';

    // If mode is single series and user is not hovering over item, skip rendering
    if (!item && tooltipMode === 'single') {
      return null;
    }

    // Check if tooltip needs to be rendered with custom tooltip component, otherwise default to GraphTooltip
    const tooltipContentRenderer = tooltipElementProps.tooltipComponent || GraphTooltip;
    // Indicates column(field) index in y-axis dimension
    const seriesIndex = item ? item.series.seriesIndex : 0;
    // Indicates row index in active field values
    const rowIndex = item ? item.dataIndex : undefined;

    const activeDimensions: ActiveDimensions<GraphDimensions> = {
      // Described x-axis active item
      // When hovering over an item - let's take it's dataIndex, otherwise undefined
      // Tooltip itself needs to figure out correct datapoint display information based on pos passed to it
      xAxis: [seriesIndex, rowIndex],
      // Describes y-axis active item
      yAxis: item ? [item.series.seriesIndex, item.dataIndex] : null,
    };

    const tooltipContentProps: TooltipContentProps<GraphDimensions> = {
      dimensions: {
        // time/value dimension columns are index-aligned - see getGraphSeriesModel
        xAxis: createDimension(
          'xAxis',
          series.map(s => s.timeField)
        ),
        yAxis: createDimension(
          'yAxis',
          series.map(s => s.valueField)
        ),
      },
      activeDimensions,
      pos: position,
      mode: tooltipElementProps.mode || 'single',
      isContext: isContextTooltip,
    };

    const tooltipContent = React.createElement(tooltipContentRenderer, { ...tooltipContentProps });

    return React.cloneElement<TooltipProps>(tooltipElement as React.ReactElement<TooltipProps>, {
      content: tooltipContent,
      position: { x: position.pageX, y: position.pageY },
      offset: { x: 10, y: 10 },
      isContext: isContextTooltip,
    });
  };

  getBarWidth = () => {
    const { series } = this.props;
    return Math.min(...series.map(s => s.timeStep));
  };

  draw() {
    if (this.element === null) {
      return;
    }

    const {
      width,
      series,
      timeRange,
      showLines,
      showBars,
      showPoints,
      isStacked,
      lineWidth,
      timeZone,
      onHorizontalRegionSelected,
    } = this.props;

    if (!width) {
      return;
    }

    const ticks = width / 100;
    const min = timeRange.from.valueOf();
    const max = timeRange.to.valueOf();
    const yaxes = this.getYAxes(series);

    const flotOptions: any = {
      legend: {
        show: false,
      },
      series: {
        stack: isStacked,
        lines: {
          show: showLines,
          linewidth: lineWidth,
          zero: false,
        },
        points: {
          show: showPoints,
          fill: 1,
          fillColor: false,
          radius: 2,
        },
        bars: {
          show: showBars,
          fill: 1,
          // Dividig the width by 1.5 to make the bars not touch each other
          barWidth: showBars ? this.getBarWidth() / 1.5 : 1,
          zero: false,
          lineWidth: lineWidth,
        },
        shadowSize: 0,
      },
      xaxis: {
        show: true,
        mode: 'time',
        min: min,
        max: max,
        label: 'Datetime',
        ticks: ticks,
        timeformat: timeFormat(ticks, min, max),
        timezone: timeZone ?? DefaultTimeZone,
      },
      yaxes,
      grid: {
        minBorderMargin: 0,
        markings: [],
        backgroundColor: null,
        borderWidth: 0,
        hoverable: true,
        clickable: true,
        color: '#a1a1a1',
        margin: { left: 0, right: 0 },
        labelMarginX: 0,
        mouseActiveRadius: 30,
      },
      selection: {
        mode: onHorizontalRegionSelected ? 'x' : null,
        color: '#666',
      },
      crosshair: {
        mode: 'x',
      },
    };

    try {
      $.plot(
        this.element,
        series.filter(s => s.isVisible),
        flotOptions
      );
    } catch (err) {
      console.log('Graph rendering error', err, flotOptions, series);
      throw new Error('Error rendering panel');
    }
  }

  render() {
    const { height, width, series } = this.props;
    const noDataToBeDisplayed = series.length === 0;
    const tooltip = this.renderTooltip();
    const context = this.renderTooltip(true);
    return (
      <div className="graph-panel">
        <div
          className="graph-panel__chart"
          ref={e => (this.element = e)}
          style={{ height, width }}
          onMouseLeave={() => {
            this.setState({ isTooltipVisible: false });
          }}
        />
        {noDataToBeDisplayed && <div className="datapoints-warning">No data</div>}
        {tooltip}
        {context}
      </div>
    );
  }
}

// Copied from graph.ts
function timeFormat(ticks: number, min: number, max: number): string {
  if (min && max && ticks) {
    const range = max - min;
    const secPerTick = range / ticks / 1000;
    const oneDay = 86400000;
    const oneYear = 31536000000;

    if (secPerTick <= 45) {
      return '%H:%M:%S';
    }
    if (secPerTick <= 7200 || range <= oneDay) {
      return '%H:%M';
    }
    if (secPerTick <= 80000) {
      return '%m/%d %H:%M';
    }
    if (secPerTick <= 2419200 || range <= oneYear) {
      return '%m/%d';
    }
    return '%Y-%m';
  }

  return '%H:%M';
}

export default Graph;
