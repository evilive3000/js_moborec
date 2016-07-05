class Adviser {
  constructor() {
    this.events = {
      'download': 1,
      'vote_up': 2,
      'vote_down': -1
    };
  }
}

module.exports = Adviser;