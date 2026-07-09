declare module 'edupage-api' {
  export class Edupage {
    students?: Array<Record<string, unknown>>
    teachers?: Array<Record<string, unknown>>
    classes?: Array<Record<string, unknown>>
    login(username: string, password: string): Promise<unknown>
  }
}
