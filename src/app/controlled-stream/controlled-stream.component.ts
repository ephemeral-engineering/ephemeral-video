import { JsonPipe, KeyValuePipe, NgStyle } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostBinding, Input, NgZone, OnDestroy, ViewChild } from '@angular/core';

import { MatButtonModule } from '@angular/material/button';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltip } from '@angular/material/tooltip';

import { LocalStream, Stream } from 'ephemeral-webrtc';

import { round2 } from '../common';
import { TOPIC_SCREEN } from '../constants';
import { ContextService } from '../context.service';
import { GLOBAL_STATE } from '../global-state';
import { Pointer, PointerComponent } from '../pointer/pointer.component';
import { StreamVideoComponent, VideoInfo } from '../stream-video/stream-video.component';

const DATA_HEADER_POINTER = 'p';
const DATA_SEPARATOR = '|';

const CNAME = 'ControlledStream';

@Component({
  selector: 'app-controlled-stream',
  standalone: true,
  imports: [MatButtonModule, MatChipsModule, MatIconModule, MatTooltip,
    JsonPipe, KeyValuePipe, NgStyle,
    StreamVideoComponent, PointerComponent],
  templateUrl: './controlled-stream.component.html',
  styleUrl: './controlled-stream.component.css'
})
export class ControlledStreamComponent implements AfterViewInit, OnDestroy {

  readonly gstate = GLOBAL_STATE;

  _objectFitSwitch = false;
  _objectFit: 'cover' | undefined = 'cover';
  _containerHeight = '100%'; // must be 100% by default if _objectFit is 'cover' by default
  _containerWidth = '100%'; // must be 100% by default if _objectFit is 'cover' by default

  peersPointers: Map<string, Pointer> = new Map();
  pointers: Pointer[] = [];

  clickPointers: Pointer[] = [];
  timeoutID: number;
  startClickPointersTimer() {
    this.timeoutID = window.setTimeout(() => {
      const threshold = Date.now() - 3000;
      this.clickPointers = this.clickPointers.filter((pointer) => (pointer.ts || 0) > threshold)
      if (this.clickPointers.length > 0) {
        this.startClickPointersTimer()
      }
    }, 1000);
  }

  addClickPointer(pointer: Pointer) {
    this.clickPointers.push(pointer)
    this.startClickPointersTimer()
  }

  peerRemoved = (peerId: string) => {
    this.peersPointers.delete(peerId)
    this.ngZone.run(() => {
      // update the data of the component
      this.pointers = [...this.peersPointers.values()];
    });
  };

  onData = (data: string, peerId: string) => {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|onData`, data, peerId)
    }
    if (data.startsWith(`${DATA_HEADER_POINTER}${DATA_SEPARATOR}`)) {

      if (this._stream instanceof LocalStream) {
        const localStream: LocalStream = this._stream;
        // forward to subscribers, except the originating peer
        const to = new Set(localStream.getSubscribers());
        to.delete(peerId)
        localStream.sendData(data, to)
      }

      // parse 'p|<l>|<t>|<n>|<ts>'
      const [_p, l, t, nickname, timestamp] = data.split(DATA_SEPARATOR);

      // convert % of original video size to this video size
      const left = +l * this.videoInfo.video.width / 100;
      const top = +t * this.videoInfo.video.height / 100;

      let pointer: Pointer;

      if (this._objectFit === 'cover') {
        if (this.videoInfo.element.aspectRatio <= this.videoInfo.video.aspectRatio) {
          // then image is full in height but image will be reduced in width
          const factor = this.videoInfo.video.height / this.videoInfo.element.height;

          const n_width = this.videoInfo.video.width / factor;
          const offset = (n_width - this.videoInfo.element.width) / 2;

          const t = top / factor;
          const n_left = (left / factor) - offset;
          const l = Math.min(Math.max(0, n_left), this.videoInfo.element.width);
          pointer = { l, t };
        } else {
          // then image is full in width but image will be reduced in height
          const factor = this.videoInfo.video.width / this.videoInfo.element.width;

          const n_height = this.videoInfo.video.height / factor;
          const offset = (n_height - this.videoInfo.element.height) / 2;

          const t = Math.min(Math.max(0, (top / factor) - offset), this.videoInfo.element.height);
          const l = (left / factor);
          pointer = { l, t };
        }
      } else {
        // manage the 'contain' case.
        // if (this.videoInfo.element.aspectRatio <= this.videoInfo.video.aspectRatio) {
        //   const factor = this.videoInfo.video.width / this.videoInfo.element.width;
        //   const n_height = this.videoInfo.video.height / factor;
        //   const offset = (this.videoInfo.element.height - n_height) / 2;
        //   const t = Math.min(Math.max(0, (data.t / factor) + offset), this.videoInfo.element.height);
        //   const l = (data.l / factor);
        //   pointer = { l, t };
        // } else {
        //   const factor = this.videoInfo.video.height / this.videoInfo.element.height;
        //   const n_width = this.videoInfo.video.width / factor;
        //   const offset = (this.videoInfo.element.width - n_width) / 2;
        //   const t = data.t / factor;
        //   const n_left = (data.l / factor) + offset;
        //   const l = Math.min(Math.max(0, n_left), this.videoInfo.element.width);
        //   pointer = { l, t };
        // }

        // If not 'cover', then undefined, 
        // the video must have kept its aspectRatio and should exactly be fitted into its parent element
        // so we shall just apply the factor
        const factor = this.videoInfo.video.width / this.videoInfo.element.width;
        pointer = { l: left / factor, t: top / factor };
      }

      if (nickname && nickname !== 'undefined') {
        pointer.n = nickname;
      }

      const prev = this.peersPointers.get(peerId);
      this.peersPointers.set(peerId, { ...(prev ? prev : {}), ...pointer });

      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|received pointer`, pointer)
      }

      this.ngZone.run(() => {
        // update the data of the component
        this.pointers = [...this.peersPointers.values()];
        if (timestamp && timestamp !== 'undefined') {
          pointer.ts = +timestamp;
          this.addClickPointer(pointer)
        }
      });
    } else if (data === 'd') {
      this.peersPointers.delete(peerId)
      this.ngZone.run(() => {
        // update the data of the component
        this.pointers = [...this.peersPointers.values()];
      });
    }
  };

  removeStreamListeners() {
    if (this._stream instanceof LocalStream) {
      this._stream.offPeer('removed', this.peerRemoved)
    }
    this._stream?.offData(this.onData)
  }

  _stream: Stream;
  @Input({ required: true }) set stream(stream: Stream) {
    // cleanup in case of stream change
    this.removeStreamListeners()

    // override
    this._stream = stream;

    if (this._stream.getPublishOptions().topic === TOPIC_SCREEN) {
      this._objectFit = undefined;
      this._videoStyle = { ...this._videoStyle };
    }

    if (this._stream instanceof LocalStream) {
      // remove pointer from a peer that unsubscribed (or left, or refreshed the page)
      this._stream.onPeer('removed', this.peerRemoved)
    }

    this._stream.onData(this.onData)
  }

  _mediaStream: MediaStream | undefined;
  @Input() set mediaStream(mediaStream: MediaStream | undefined) {
    this._mediaStream = mediaStream;
  }

  _videoStyle: { [klass: string]: any; } = {};
  @Input() set videoStyle(style: { [klass: string]: any; }) {
    this._videoStyle = { ...this._videoStyle, ...style, objectFit: this._objectFit };
  }

  _muted = false;
  @Input() set muted(muted: boolean) {
    this._muted = muted;
  }

  _sinkId: string;
  @Input() set sinkId(id: string) {
    this._sinkId = id;
  }

  @HostBinding("style.--flex-direction")
  private flexDirection: string = 'row';

  @HostBinding("style.--min-height")
  private minHeight: string = '50px';
  @HostBinding("style.--min-width")
  private minWidth: string = '50px';

  @ViewChild('container') container: ElementRef | undefined;
  @ViewChild('label') label: ElementRef | undefined;
  @ViewChild('controls') controls: ElementRef | undefined;
  @ViewChild('dcontrols') displayControls: ElementRef | undefined;
  @ViewChild('info') info: ElementRef | undefined;

  // https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
  private controlsObs: ResizeObserver | undefined;
  private componentObs: ResizeObserver | undefined;

  private aspectRatio: number = -1;
  private videoAspectRatio: number = -1;

  constructor(private el: ElementRef,
    private ngZone: NgZone,
    private contextService: ContextService,
  ) { }

  ngAfterViewInit() {

    let controlsEntry: ResizeObserverEntry | undefined = undefined;
    let displayControlsEntry: ResizeObserverEntry | undefined = undefined;
    let labelEntry: ResizeObserverEntry | undefined = undefined;
    let infoEntry: ResizeObserverEntry | undefined = undefined;

    const doCalcMinHeightWidth = () => {
      // 'objectFit' control button is actually a fixed button of 48px
      // It can be displayed or not but the problem is that it appears according to aspect ratio,
      // which can be modified when minHeght/minWidth kick in. It then enters a resizing loop that never ends growing and shrinking.
      // To prevent that, consider objectFitEntry is always 48px
      const height = Math.max((controlsEntry?.contentRect.height || 0) + (displayControlsEntry?.contentRect.height || 0) + 4,
        (labelEntry?.contentRect.height || 0) + (this.info?.nativeElement.height || 0) + 4
      );
      const width = Math.max((controlsEntry?.contentRect.width || 0), (infoEntry?.contentRect.width || 0) + ((controlsEntry?.contentRect.width || 0) * 2) + 8,
        (labelEntry?.contentRect.width || 0) + (displayControlsEntry?.contentRect.width || 0)
      );

      this.minHeight = `${height + 8}px`;
      this.minWidth = `${width + 8}px`;
    }

    this.controlsObs = new ResizeObserver((entries) => {
      entries.forEach((entry) => {
        switch (entry.target) {
          case this.controls?.nativeElement:
            controlsEntry = entry;
            break;
          case this.displayControls?.nativeElement:
            displayControlsEntry = entry;
            break;
          case this.label?.nativeElement:
            labelEntry = entry;
            break;
          case this.info?.nativeElement:
            infoEntry = entry;
            break;
          default:
            break;
        }
      })
      doCalcMinHeightWidth()
    });
    this.controlsObs.observe(this.controls?.nativeElement);
    this.controlsObs.observe(this.displayControls?.nativeElement);
    this.controlsObs.observe(this.label?.nativeElement);
    this.controlsObs.observe(this.info?.nativeElement);

    this.componentObs = new ResizeObserver((_entries) => {
      this.aspectRatio = round2(this.el.nativeElement.clientWidth / this.el.nativeElement.clientHeight);
      this.doCheckAspectRatios()
    });
    this.componentObs.observe(this.el.nativeElement);
  }

  doCheckAspectRatios() {
    if (this.aspectRatio !== -1 && this.videoAspectRatio !== -1) {
      if (this._objectFit !== 'cover') {
        if (this.aspectRatio + 0.01 > this.videoAspectRatio - 0.01) {
          this.flexDirection = 'row';
          this._containerHeight = '100%';
          this._containerWidth = 'auto';
        } else {
          this.flexDirection = 'column';
          this._containerHeight = 'auto';
          this._containerWidth = '100%';
        }
      }
      this._objectFitSwitch = Math.abs(this.aspectRatio - this.videoAspectRatio) > 0.02; // 0.01 is sometimes not enough for localstream even in auto to not detect an unsignificant difference
    }
  }

  ngOnDestroy() {
    if (this.controlsObs) {
      // disconnect() unobserves all observed Element targets of a particular observer.
      this.controlsObs.disconnect();
    }

    this.removeStreamListeners()
  }

  toggleObjectFit() {
    this._objectFit = this._objectFit === undefined ? 'cover' : undefined;
    this._videoStyle = { ...this._videoStyle, objectFit: this._objectFit };
    if (this._objectFit === 'cover') {
      this._containerHeight = '100%';
      this._containerWidth = '100%';
    } else {
      this.doCheckAspectRatios()
    }
  }

  // human readable displayed video size
  videoSize = "";

  videoInfo: VideoInfo = {
    element: {
      aspectRatio: 1,
      height: 1,
      width: 1
    },
    video: {
      aspectRatio: 1,
      height: 1,
      width: 1
    }
  };

  onInfo(info: VideoInfo) {
    this.videoInfo = info;
    const frameRate = this._mediaStream?.getVideoTracks()[0].getSettings().frameRate;
    this.videoSize = `${info.video.width}x${info.video.height}@${frameRate || '?'}i/s`;
    this.contextService.recordNotification(`stream<${this._mediaStream?.id}> ${this.videoSize}`)
    this.videoAspectRatio = round2(info.video.width / info.video.height);
    this.doCheckAspectRatios()
  }

  getLocalPointer(event: MouseEvent) {
    const rect = this.container?.nativeElement.getBoundingClientRect();
    return {
      l: event.clientX - Math.round(rect.left),
      t: event.clientY - Math.round(rect.top)
    }
  }

  translateToMediaPercentage(pointer: { l: number, t: number }) {

    let l_pointer: { l: number, t: number };
    if (this._objectFit === 'cover') {
      if (this.videoInfo.element.aspectRatio <= this.videoInfo.video.aspectRatio) {
        // then image is full in height but is cropped in width
        const factor = this.videoInfo.video.height / this.videoInfo.element.height;
        // the width the video would take in element if it was not cropped
        const elt_v_width = this.videoInfo.video.width / factor;
        const offset = (elt_v_width - this.videoInfo.element.width) / 2;

        l_pointer = {
          l: (pointer.l + offset) * factor,
          t: pointer.t * factor
        };
      } else {
        // then image is full in width but image will be reduced in height
        const factor = this.videoInfo.video.width / this.videoInfo.element.width;

        // the height the video would take in element if it was not cropped
        const elt_v_height = this.videoInfo.video.height / factor;
        const offset = (elt_v_height - this.videoInfo.element.height) / 2;

        l_pointer = {
          l: pointer.l * factor,
          t: (pointer.t + offset) * factor
        };
      }
    } else {
      // The video is just adapted to the parent element
      const factor = this.videoInfo.video.width / this.videoInfo.element.width;
      l_pointer = {
        l: pointer.l * factor,
        t: pointer.t * factor
      };
    }

    // Convert in %
    // This overcomes the problem when the video may not be received in same resolution
    // it is sent. In such case working with pixels leads to wrong placement.
    // Rounding 2 digits after comma might be enough accuracy and prevent from sending
    // too large amount of data.
    return {
      l: round2(l_pointer.l * 100 / this.videoInfo.video.width),
      t: round2(l_pointer.t * 100 / this.videoInfo.video.height)
    }
  }

  private moveCounter = 0;

  onPointerMove(event: PointerEvent) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events

    const count10 = this.moveCounter++ % 10 === 0;

    const pointer: Pointer = {
      ...this.translateToMediaPercentage(this.getLocalPointer(event)),
      ...(count10 ? { n: GLOBAL_STATE.nickname } : {})
    };

    const data = [DATA_HEADER_POINTER, pointer.l, pointer.t, pointer.n].join(DATA_SEPARATOR);
    this._stream.sendData(data)
  }

  onClick(event: MouseEvent) {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|onClick`, event)
    }

    const local: Pointer = this.getLocalPointer(event);

    this.addClickPointer({
      ...local,
      ts: Date.now()
    })

    const pointer = {
      ...this.translateToMediaPercentage(local),
      n: GLOBAL_STATE.nickname,
      ts: Date.now()
    }

    const data = [DATA_HEADER_POINTER, pointer.l, pointer.t, pointer.n, pointer.ts].join(DATA_SEPARATOR);
    this._stream.sendData(data)
  }


  // onPointerEnter(event: PointerEvent) {
  //   // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
  //   if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
  //     console.debug(`${CNAME}|onPointerEnter`, event, this._stream)
  //   }
  // }

  onPointerLeave(event: PointerEvent) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|onPointerLeave`, event)
    }

    this._stream.sendData('d')
  }

}
