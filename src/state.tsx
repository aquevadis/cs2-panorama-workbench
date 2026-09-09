import React, { createContext, useContext, useState } from 'react';
export type GameState={health:number;roundTime:number;alert:string};
type Store={state:GameState;patch:(p:Partial<GameState>)=>void};
const C=createContext<Store|null>(null);
export function ConVarProvider({children}:{children:React.ReactNode}){
 const [state,setState]=useState<GameState>({health:100,roundTime:115,alert:''});
 return <C.Provider value={{state,patch:p=>setState(s=>({...s,...p}))}}>{children}</C.Provider>;
}
export function useGame(){const value=useContext(C);if(!value)throw Error('ConVarProvider missing');return value;}
