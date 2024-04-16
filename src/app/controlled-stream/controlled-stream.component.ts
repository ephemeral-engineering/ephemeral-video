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

  _stream: Stream;
  @Input({ required: true }) set stream(stream: Stream) {
    this._stream = stream;

    this._stream.onDataChannel(DATACHANNEL_POINTER_PATH, (dataChannel: RTCDataChannel) => {
      // DONE: create a pointer each datachannel
      // DONE: how do we know this is for a pointer ? => path indicates the purpose
      // DONE: how do we know who is sending his pointer ? => some messages contain nickname

      dataChannel.addEventListener('message', (event) => {
        const data = JSON.parse(event.data) as Pointer;
        const prev = this.pointerChannels.get(dataChannel);

        // convert % of original video size to this video size
        data.l = data.l * this.videoInfo.video.width / 100;
        data.t = data.t * this.videoInfo.video.height / 100;

        let pointer: Pointer;

        if (this.videoInfo.element.aspectRatio <= this.videoInfo.video.aspectRatio) {
          // then image is full in height but image will be reduced in width
          const factor = this.videoInfo.video.height / this.videoInfo.element.height;

          const n_width = this.videoInfo.video.width / factor;
          const offset = (n_width - this.videoInfo.element.width) / 2;

          const t = data.t / factor;
          const n_left = (data.l / factor) - offset;
          const l = Math.min(Math.max(0, n_left), this.videoInfo.element.width);
          pointer = { l, t };
        } else {
          // then image is full in width but image will be reduced in height
          const factor = this.videoInfo.video.width / this.videoInfo.element.width;

          const n_height = this.videoInfo.video.height / factor;
          const offset = (n_height - this.videoInfo.element.height) / 2;

          const t = Math.min(Math.max(0, (data.t / factor) - offset), this.videoInfo.element.height);
          const l = (data.l / factor);
          pointer = { l, t };
        }

        if (data.n) {
          pointer.n = data.n;
        }

        this.pointerChannels.set(dataChannel, { ...(prev ? prev : {}), ...pointer });

        this.ngZone.run(() => {
          // update the data of the component
          this.pointers = [...this.pointerChannels.values()];
          if (data.ts) {
            pointer.ts = data.ts;
            this.addClickPointer(pointer)
          }
          if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
            console.debug(`${CNAME}|received`, data, pointer, this.videoInfo, this.pointers)
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

  getLocalPointer(event: MouseEvent) {
    const rect = this.el.nativeElement.getBoundingClientRect();
    return {
      l: event.clientX - Math.round(rect.left),
      t: event.clientY - Math.round(rect.top)
    }
  }

  translateToMediaPercentage(coords: { l: number, t: number }) {
    // const rect = this.el.nativeElement.getBoundingClientRect();
    // const left = event.clientX - Math.round(rect.left); //x position within the element.
    // const top = event.clientY - Math.round(rect.top);  //y position within the element.

    //const { l: left, t: top } = this.getLocalPointer(event);

    // Round with 2 decimal to reduce amount of data sent on the datachannel, still keeping enough accuracy
    // Math.round((num + Number.EPSILON) * 100) / 100
    function round2(num: number) {
      return Math.round((num + Number.EPSILON) * 100) / 100
    }

    let vCoord;
    if (this.videoInfo.element.aspectRatio <= this.videoInfo.video.aspectRatio) {
      // then image is full in height but is cropped in width
      const factor = this.videoInfo.video.height / this.videoInfo.element.height;
      // the width the video would take in element if it was not cropped
      const elt_v_width = this.videoInfo.video.width / factor;
      const offset = (elt_v_width - this.videoInfo.element.width) / 2;

      vCoord = {
        left: (coords.l + offset) * factor,
        top: coords.t * factor
      };

    } else {
      // then image is full in width but image will be reduced in height
      const factor = this.videoInfo.video.width / this.videoInfo.element.width;

      // the height the video would take in element if it was not cropped
      const elt_v_height = this.videoInfo.video.height / factor;
      const offset = (elt_v_height - this.videoInfo.element.height) / 2;

      vCoord = {
        left: coords.l * factor,
        top: (coords.t + offset) * factor
      };
    }

    // Convert in %
    // This overcomes the problem when the video may not be received in same resolution
    // it is sent. In such case working with pixels leads to wrong placement.
    // Rounding 2 digits after comma might be enough accuracy and prevent from sending
    // too large amount of data.
    return {
      l: round2(vCoord.left * 100 / this.videoInfo.video.width),
      t: round2(vCoord.top * 100 / this.videoInfo.video.height)
    }
  }

  onPointerMove(event: PointerEvent) {
    // https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events

    this.moveCounter++;
    const pointer: Pointer = {
      ...this.translateToMediaPercentage(this.getLocalPointer(event)),
      ...(this.moveCounter % 10 === 0 ? { n: GLOBAL_STATE.nickname } : {})
    };
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      const array = Array.from(this.openDataChannels);
      console.debug(`${CNAME}|onPointerMove sending`, pointer, array.map((elt) => elt.readyState))
    }

    this.openDataChannels.forEach((dataChannel) => {
      dataChannel.send(JSON.stringify(pointer))
    })
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

    const sendPointer = {
      ...this.translateToMediaPercentage(local),
      n: GLOBAL_STATE.nickname,
      ts: Date.now()
    }

    this.openDataChannels.forEach((dataChannel) => {
      dataChannel.send(JSON.stringify(sendPointer))
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
