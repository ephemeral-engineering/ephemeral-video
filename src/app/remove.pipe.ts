import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'remove',
  standalone: true
})
export class RemovePipe implements PipeTransform {

  transform(items: Set<any>, itemToRemove: any): any {
    if (!items || !itemToRemove) {
      return items;
    }
    const filtered = new Set(items);
    for (let item of filtered) {
      // console.log("RemovePipe", item)
      if (item === itemToRemove) {
        filtered.delete(item)
      }
    }
    return filtered;
  }

}
