import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'filterOut',
  standalone: true
})
export class FilterOutPipe implements PipeTransform {

  transform(value: any, ...args: string[]): unknown {
    const out = { ...value };
    for (let arg of args) {
      delete out[arg]
    }
    return out;
  }

}
