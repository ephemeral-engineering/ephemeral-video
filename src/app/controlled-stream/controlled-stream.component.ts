import { JsonPipe, KeyValuePipe, NgFor } from '@angular/common';
import { AfterViewInit, Component, ElementRef, HostBinding, Input, NgZone, OnDestroy, ViewChild } from '@angular/core';

import { Stream } from 'ephemeral-webrtc';

import { DATACHANNEL_POINTER_PATH } from '../constants';
import { ContextService } from '../context.service';
import { GLOBAL_STATE } from '../global-state';
import { Pointer, PointerComponent } from '../pointer/pointer.component';
import { StreamVideoComponent, VideoInfo } from '../stream-video/stream-video.component';

const CNAME = 'ControlledStream';

@Component({
  selector: 'app-controlled-stream',
  standalone: true,
  imports: [JsonPipe, NgFor, KeyValuePipe, StreamVideoComponent, PointerComponent],
  templateUrl: './controlled-stream.component.html',
  styleUrl: './controlled-stream.component.css'
})
export class ControlledStreamComponent implements AfterViewInit, OnDestroy {

  pointerChannels: Map<RTCDataChannel, Pointer> = new Map();
  pointers: Pointer[] = [];

  _stream: Stream;
  @Input({ required: true }) set stream(stream: Stream) {
    this._stream = stream;

    this._stream.onDataChannel(DATACHANNEL_POINTER_PATH, (dataChannel: RTCDataChannel) => {
      // DONE create a pointer each datachannel
      // DONE: how do we know this is for a pointer ? => path indicates the purpose
      // DONE: how do we know who is sending his pointer ? => first message contains nickname, next ones will be {top, left}

      dataChannel.addEventListener('message', (event) => {
        const data = JSON.parse(event.data) as Pointer;
        const prev = this.pointerChannels.get(dataChannel);

        let target: Pointer;

        if (this.videoInfo.element.aspectRatio <= this.videoInfo.video.aspectRatio) {
          // then image is full in height but image will be reduced in width
          const factor = this.videoInfo.video.height / this.videoInfo.element.height;

          const n_width = this.videoInfo.video.width / factor;
          const offset = (n_width - this.videoInfo.element.width) / 2;

          const top = data.top / factor;
          const n_left = (data.left / factor) - offset;
          const left = Math.min(Math.max(0, n_left), this.videoInfo.element.width);
          target = { left, top }
        } else {
          // then image is full in width but image will be reduced in height
          const factor = this.videoInfo.video.width / this.videoInfo.element.width;

          const n_height = this.videoInfo.video.height / factor;
          const offset = (n_height - this.videoInfo.element.height) / 2;

          const top = Math.min(Math.max(0, (data.top / factor) - offset), this.videoInfo.element.height);
          const left = (data.left / factor);
          target = { left, top }
        }

        this.pointerChannels.set(dataChannel, { ...(prev ? prev : {}), ...target });
        this.ngZone.run(() => {
          // update the data of the component
          this.pointers = [...this.pointerChannels.values()];
          if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
            console.debug(`${CNAME}|received`, data, target, this.videoInfo, this.pointers)
          }
        });
      });
      dataChannel.addEventListener('error', (error) => {
        console.error(`${CNAME}|dataChannel.onerror`, error)
        this.pointerChannels.delete(dataChannel);
      })
      dataChannel.addEventListener('close', () => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|dataChannel.onclose`)
        }
        this.pointerChannels.delete(dataChannel);
      })
    })
  }

  _mediaStream: MediaStream | undefined;
  @Input() set mediaStream(mediaStream: MediaStream | undefined) {
    this._mediaStream = mediaStream;
  }

  _videoStyle: { [klass: string]: any; } = {};
  @Input() set videoStyle(style: { [klass: string]: any; }) {
    this._videoStyle = { ...this._videoStyle, ...style };
  }

  _muted = false;
  @Input() set muted(muted: boolean) {
    this._muted = muted;
  }

  _sinkId: string;
  @Input() set sinkId(id: string) {
    this._sinkId = id;
  }

  @HostBinding("style.--min-height")
  private minHeight: string = '50px';
  @HostBinding("style.--min-width")
  private minWidth: string = '50px';

  @ViewChild('label') label: ElementRef | undefined;
  @ViewChild('controls') controls: ElementRef | undefined;

  // https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
  private observer: ResizeObserver | undefined;

  constructor(private el: ElementRef,
    private ngZone: NgZone,
    private contextService: ContextService,
  ) { }

  ngAfterViewInit() {
    if (this.label && this.controls) {
      this.observer = new ResizeObserver((entries) => {
        let height = 0, width = 0;
        entries.forEach((entry) => {
          height = Math.max(height, entry.contentRect.height);
          width = Math.max(width, entry.contentRect.width);
        })
        this.minHeight = `${height + 4 * 2}px`;
        this.minWidth = `${width + 4 * 2}px`;
      });
      this.observer.observe(this.label.nativeElement);
      this.observer.observe(this.controls.nativeElement);
    }
  }

  ngOnDestroy() {
    if (this.observer) {
      // disconnect() unobserves all observed Element targets of a particular observer.
      this.observer.disconnect();
    }
  }

  outboundDataChannels: Set<RTCDataChannel> = new Set();
  openDataChannels: Set<RTCDataChannel> = new Set();

  // human readable displayed video size
  videoSize = "";

  videoInfo: VideoInfo = {
    element: {
      aspectRatio: 1,
      width: 1,
      height: 1
    },
    video: {
      aspectRatio: 1,
      width: 1,
      height: 1
    }
  };
  
  onInfo(info: VideoInfo) {
    this.videoInfo = info;
    const frameRate = this._mediaStream?.getVideoTracks()[0].getSettings().frameRate;
    this.videoSize = `${info.video.width}x${info.video.height}@${frameRate || '?'}i/s`;
    this.contextService.recordNotification(`stream<${this._mediaStream?.id}> ${this.videoSize}`)
  }

  onPointerEnter(event: PointerEvent) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|onPointerEnter`, event, this._stream)
    }

    this._stream?.broadcast(DATACHANNEL_POINTER_PATH, (dataChannel) => {
      const added = this.outboundDataChannels.add(dataChannel);
      if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
        console.debug(`${CNAME}|onPointerEnter stored outbound DataChannel`, dataChannel, this.outboundDataChannels.size, added)
      }

      dataChannel.onopen = () => {
        this.openDataChannels.add(dataChannel);
      };
      dataChannel.onclose = () => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|broadcast dataChannel.onclose`)
        }
        this.outboundDataChannels.delete(dataChannel)
        this.openDataChannels.delete(dataChannel)
      }
      dataChannel.onerror = (error) => {
        if (globalThis.ephemeralVideoLogLevel.isWarnEnabled) {
          console.warn(`${CNAME}|broadcast dataChannel.onerror`, error)
        }
        this.outboundDataChannels.delete(dataChannel)
        this.openDataChannels.delete(dataChannel)
      }
    }, { ordered: false })
  }

  private moveCounter = 0;

  onPointerMove(event: PointerEvent) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events

    // if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
    //   console.debug(`${CNAME}|onPointerMove`, event)
    // }

    // const x = event.clientX - (this.el.nativeElement.offsetLeft ?? 0);
    // const y = event.clientY - (this.el.nativeElement.offsetTop ?? 0);
    const rect = this.el.nativeElement.getBoundingClientRect();
    const left = event.clientX - Math.round(rect.left); //x position within the element.
    const top = event.clientY - Math.round(rect.top);  //y position within the element.
    // const left = `${Math.round(x * 100 / (this.el.nativeElement.clientWidth || 100))}%`;
    // const top = `${Math.round(y * 100 / (this.el.nativeElement.clientHeight || 100))}%`;

    // Round with 2 decimal to reduce amount of data sent on the datachannel, still keeping enough accuracy
    // Math.round((num + Number.EPSILON) * 100) / 100
    // console.log('onPointerMove', x, this.el.nativeElement.clientWidth)
    function round2(num: number) {
      return Math.round((num + Number.EPSILON) * 100) / 100
    }
    // const left = round2(x * 100 / (this.el.nativeElement.clientWidth || 100));
    // const top = round2(y * 100 / (this.el.nativeElement.clientHeight || 100));

    this.moveCounter++;

    let vCoord;
    if (this.videoInfo.element.aspectRatio <= this.videoInfo.video.aspectRatio) {
      // then image is full in height but is cropped in width
      const factor = this.videoInfo.video.height / this.videoInfo.element.height;
      // the width the video would take in element if it was not cropped
      const elt_v_width = this.videoInfo.video.width / factor;
      const offset = (elt_v_width - this.videoInfo.element.width) / 2;

      vCoord = {
        left: (left + offset) * factor,
        top: top * factor
      };
      // const _left = Math.min(Math.max(0, n_left), this.videoInfo.element.width);

    } else {
      // then image is full in width but image will be reduced in height
      const factor = this.videoInfo.video.width / this.videoInfo.element.width;

      // the height the video would take in element if it was not cropped
      const elt_v_height = this.videoInfo.video.height / factor;
      const offset = (elt_v_height - this.videoInfo.element.height) / 2;

      vCoord = {
        left: left * factor,
        top: (top + offset) * factor
      };
    }

    const pointer = {
      ...vCoord,
      ...(this.moveCounter % 10 === 0 ? { nickname: GLOBAL_STATE.nickname } : {})
    };
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      const array = Array.from(this.openDataChannels);
      console.debug(`${CNAME}|onPointerMove sending`, { left, top }, pointer, array.map((elt) => elt.readyState))
    }

    this.openDataChannels.forEach((dataChannel) => {
      dataChannel.send(JSON.stringify(pointer))
    })

  }

  onPointerLeave(event: PointerEvent) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|onPointerLeave`, event)
    }
    this.outboundDataChannels.forEach((dataChannel) => {
      dataChannel.close()
    })
    this.openDataChannels.clear()
    this.outboundDataChannels.clear()
  }

}
