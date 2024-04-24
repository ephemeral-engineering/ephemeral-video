import { NgClass, NgStyle } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, HostBinding, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { round2 } from '../common';

export const VIDEO_ROUNDED_CORNERS = { borderRadius: '4px', overflow: 'hidden' };

export type VideoInfo = {
  element: {
    aspectRatio: number,
    height: number
    width: number,
  }
  video: {
    aspectRatio: number,
    height: number
    width: number,
  }
};

const CNAME = 'StreamVideo';

@Component({
  selector: 'app-stream-video',
  templateUrl: './stream-video.component.html',
  styleUrls: ['./stream-video.component.css'],
  standalone: true,
  imports: [NgStyle, NgClass]
})
export class StreamVideoComponent implements AfterViewInit, OnDestroy {

  @ViewChild("video") videoRef: ElementRef<HTMLVideoElement> | undefined;

  // https://developer.mozilla.org/en-US/docs/Web/API/ResizeObserver
  private observer: ResizeObserver | undefined;

  _mediaStream: MediaStream | undefined;
  @Input() set mediaStream(mediaStream: MediaStream | undefined) {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|mediaStream`, mediaStream, mediaStream?.getTracks().length);
    }
    this._mediaStream = mediaStream;
  }

  _videoStyle: { [klass: string]: any; } = {
    // minHeight: '100%', minWidth: '100%',
    // width: '99vw', height: '75vw',
    //  maxWidth: '133.34vh', maxHeight: '100vh',
    // 'object-fit': 'contain',
    height: 'inherit',
    width: 'inherit',
    ...VIDEO_ROUNDED_CORNERS
  };
  @Input() set videoStyle(style: { [klass: string]: any; }) {
    this._videoStyle = { ...this._videoStyle, ...style };
  }

  _muted = false;
  @Input() set muted(muted: boolean) {
    this._muted = muted;
  }

  _mirror = false;
  @Input() set mirror(mirror: boolean) {
    this._mirror = mirror;
  }

  _fullscreen = false;
  @Input() set fullscreen(fullscreen: boolean) {
    this._fullscreen = fullscreen;
  }

  _sinkId: string;
  @Input() set sinkId(id: string) {
    if (id) {
      this._sinkId = id;
      if (this.videoRef) {
        (this.videoRef.nativeElement as any).setSinkId(id)
      }
    }
  }

  @Output() onInfo = new EventEmitter<VideoInfo>();

  // video_height: string = 'auto';
  // video_width: string = 'auto';

  constructor(private el: ElementRef) { }

  ngAfterViewInit() {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|ngAfterViewInit`, this.videoRef);
    }

    // remote stream is attached to DOM during ngAfterViewInit
    // @ViewChild is not bound before this stage

    if (this.videoRef) {

      const videoElement = this.videoRef.nativeElement;

      const getInfos = () => {
        return {
          element: {
            aspectRatio: videoElement.clientWidth / videoElement.clientHeight,
            width: videoElement.clientWidth, height: videoElement.clientHeight
          },
          video: {
            aspectRatio: videoElement.videoWidth / videoElement.videoHeight,
            width: videoElement.videoWidth, height: videoElement.videoHeight
          }
        }
      }

      const emitInfo = (infos: any) => {
        this.onInfo.emit(infos)
      };

      this.observer = new ResizeObserver((_entries) => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|ResizeObserver runs`);
        }

        const infos = getInfos();

        // const hostAspectRatio = round2(this.el.nativeElement.clientWidth / this.el.nativeElement.clientHeight);

        // if (hostAspectRatio <= infos.video.aspectRatio) {
        //   // this.video_height = '100%';
        //   // this.video_width = 'auto';
        //   this._videoStyle = { ...this._videoStyle, height: '100%', width: 'auto' };
        //   console.log("AspectRatio AR <= VAR",this.el.nativeElement,  hostAspectRatio, infos.video.aspectRatio)
        // } else {
        //   // this.video_height = 'auto';
        //   // this.video_width = '100%';
        //   this._videoStyle = { ...this._videoStyle, height: 'auto', width: '100%' };
        //   console.log("AspectRatio AR > VAR",this.el.nativeElement, hostAspectRatio, infos.video.aspectRatio)
        // }

        emitInfo(infos)
      });
      this.observer.observe(this.el.nativeElement);
      this.observer.observe(videoElement);

      const onLoadedData = (ev: Event) => {
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|onLoadedData ${ev.type}`);
        }
        const infos = getInfos();
        emitInfo(infos)
      }

      // videoElement.addEventListener("loadeddata", onLoadedData);
      // videoElement.addEventListener("loadedmetadata", onLoadedData);
      // videoElement.addEventListener("ratechange", onLoadedData);
      videoElement.addEventListener("resize", onLoadedData);
    }
  }

  ngOnDestroy(): void {
    this.observer?.disconnect()
  }
}
