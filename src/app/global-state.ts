import { getSessionStorage } from "./common";
import { STORAGE_PREFIX } from "./constants";

export type State = {
    nickname: string
    sinkId: string | undefined
}

export const GLOBAL_STATE: State = {
    nickname: getSessionStorage(`${STORAGE_PREFIX}-nickname`) || '',
    sinkId: undefined
};