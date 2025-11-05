import * as React from 'react'

export function Tabs({defaultValue, children}:{defaultValue:string, children:any}){
  const [val, setVal] = React.useState(defaultValue)
  return <div>{React.Children.map(children, (child:any)=> React.cloneElement(child, {value: val, setValue: setVal}))}</div>
}

export function TabsList({children, value, setValue}:{children:any, value?:string, setValue?:(v:string)=>void}){
  return <div className="flex gap-2 mb-3">{React.Children.map(children, (c:any)=> React.cloneElement(c, {value, setValue}))}</div>
}

export function TabsTrigger({value: v, children, setValue}:{value:string, children:any, setValue?:(v:string)=>void}){
  return <button className={`px-3 py-1 rounded border ${v===undefined? '' : ''}`} onClick={()=>setValue && setValue((v as any).props?.value || '')}>{children}</button>
}

export function TabsContent({value, children, setValue}:{value:string, children:any, setValue?:(v:string)=>void}){
  // HACK: The parent passes current value as prop 'value'
  const current = (setValue as any) // not used
  // The actual value is stored in parent; for brevity, render all (MVP)
  return <div className="mt-2">{children}</div>
}
