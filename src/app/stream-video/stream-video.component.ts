import { NgClass, NgStyle } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, ViewChild } from '@angular/core';
import { ContextService } from '../context.service';

export const VIDEO_ROUNDED_CORNERS = { borderRadius: '4px', overflow: 'hidden' };

const CNAME = 'StreamVideo';

@Component({
  selector: 'app-stream-video',
  templateUrl: './stream-video.component.html',
  styleUrls: ['./stream-video.component.css'],
  standalone: true,
  imports: [NgStyle, NgClass]
})
export class StreamVideoComponent implements AfterViewInit { //implements AfterViewInit, OnDestroy

  @ViewChild("video") videoRef: ElementRef<HTMLVideoElement> | undefined;

  _mediaStream: MediaStream | undefined;
  @Input() set mediaStream(mediaStream: MediaStream | undefined) {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|mediaStream`, mediaStream, mediaStream?.getTracks().length);
    }
    this._mediaStream = mediaStream;
    // if (this.videoRef) {
    //   this.videoRef.nativeElement.srcObject = mediaStream;
    // }
  }

  _videoStyle: { [klass: string]: any; } = {
    // minHeight: '100%', minWidth: '100%',
    // width: '99vw', height: '75vw',
    //  maxWidth: '133.34vh', maxHeight: '100vh',
    'object-fit': 'contain',
    ...VIDEO_ROUNDED_CORNERS
  };
  @Input() set videoStyle(style: { [klass: string]: any; }) {
    this._videoStyle = { ...this._videoStyle, ...style };
  }

  _muted = false;
  @Input() set muted(muted: boolean) {
    this._muted = muted;
    // if (this.videoRef) {
    //   this.videoRef.nativeElement.muted = this._muted;
    // }
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

  videoSize = "";

  constructor(
    private contextService: ContextService,
  ) { }

  ngAfterViewInit() {
    if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      console.debug(`${CNAME}|ngAfterViewInit`, this.videoRef);
    }
    // remote stream is attached to DOM during ngAfterViewInit because @ViewChild is not bound before this stage
    // this.doAttach();

    if (this.videoRef) {

      const videoElement = this.videoRef.nativeElement;

      // const { videoHeight: height, videoWidth: width } = videoElement;
      // this.videoSize = `${width}x${height}`;

      videoElement.addEventListener("loadeddata", () => {
        const { videoHeight: height, videoWidth: width } = videoElement;
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|loadeddata`, { height, width }, videoElement, this._mediaStream);
        }
        const frameRate = this._mediaStream?.getVideoTracks()[0].getSettings().frameRate;
        this.videoSize = `${width}x${height}@${frameRate||'?'}i/s`;
        this.contextService.recordNotification(`stream<${this._mediaStream?.id}> loaded-to:${width}x${height}@${frameRate||'?'}i/s`)

      }, false);

      // videoElement.addEventListener("loadedmetadata", (event) => {
      //   if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
      //     console.debug(`${CNAME}|loadedmetadata`, event.target);
      //   }
      // });

      videoElement.addEventListener("resize", () => {
        const { videoHeight: height, videoWidth: width } = videoElement;
        if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
          console.debug(`${CNAME}|resize`, { height, width });
        }

        const frameRate = this._mediaStream?.getVideoTracks()[0].getSettings().frameRate;
        this.videoSize = `${width}x${height}@${frameRate||'?'}i/s`;
        this.contextService.recordNotification(`stream<${this._mediaStream?.id}> resized-to:${width}x${height}@${frameRate||'?'}i/s`)
      }, false);
    }
  }

  // ngOnDestroy(): void {
  //   if (globalThis.logLevel.isDebugEnabled) {
  //     console.debug(`${CNAME}|ngOnDestroy`, this.videoRef);
  //   }
  //   // throw new Error('Method not implemented.');
  //   if (this.videoRef) {
  //     this.videoRef.nativeElement.srcObject = undefined;
  //   }
  // }

  // doAttach() {
  //   if (this.videoRef) {
  //     const video = this.videoRef.nativeElement;
  //     video.srcObject = this._mediaStream;
  //   }
  // }
}
