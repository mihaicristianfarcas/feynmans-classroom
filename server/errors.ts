/* Errors the routes turn into HTTP statuses: a thrown NotFound answers 404; any other error answers
 * 400 with its message, which is written for the learner to read. */

/** The thing asked for doesn't exist. */
export class NotFound extends Error {
  constructor(what = "not found") {
    super(what);
    this.name = "NotFound";
  }
}
