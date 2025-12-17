import { getSessionStorage, isMobile } from "./common";
import { STORAGE_PREFIX } from "./constants";

export type State = {
    isMobile: boolean,
    monitor: boolean,
    nickname: string,
    publish: boolean,
    sinkId: string | undefined,
}

export const GLOBAL_STATE: State = {
    isMobile: isMobile(),
    monitor: false,
    nickname: getSessionStorage(`${STORAGE_PREFIX}-nickname`) || '',
    publish: true,
    sinkId: undefined
};