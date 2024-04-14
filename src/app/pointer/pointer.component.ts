import { Component, ElementRef, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

// use one letter to reduce amount of exchanged data
export type Pointer = {
  n?: string
  t: number
  l: number
};

const CNAME = 'Pointer';

@Component({
  selector: 'app-pointer',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './pointer.component.html',
  styleUrl: './pointer.component.css'
})
export class PointerComponent {

  nickname = "";

  @Input({ required: true }) set pointer(data: Pointer) {
    // if (globalThis.ephemeralVideoLogLevel.isDebugEnabled) {
    //   console.debug(`${CNAME}|set pointer`, data)
    // }
    this.el.nativeElement.style.left = `${data.l}px`;
    this.el.nativeElement.style.top = `${data.t}px`;
    this.nickname = data.n || "";
  }

  constructor(private el: ElementRef) { }
}
