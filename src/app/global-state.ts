import { getSessionStorage } from "./common";
import { STORAGE_PREFIX } from "./constants";

export type State = {
    monitor: boolean,
    nickname: string
    sinkId: string | undefined
}

export const GLOBAL_STATE: State = {
    monitor: false,
    nickname: getSessionStorage(`${STORAGE_PREFIX}-nickname`) || '',
    sinkId: undefined
};