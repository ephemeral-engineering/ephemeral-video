import { Component, ElementRef, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

export type Pointer = {
  nickname?: string
  top: number
  left: number
}

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
    this.el.nativeElement.style.left = `${data.left}px`;
    this.el.nativeElement.style.top = `${data.top}px`;
    this.nickname = data.nickname || "";
  }

  constructor(private el: ElementRef) { }
}
