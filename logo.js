var Logo = {
  WHITESPACE: /[ \r\n\t]/,
  LITERALS: /[ \[\]]/,
  tokenize: function Logo_tokenize(str) {
    var tokens = [];
    var state = 'whitespace';
    var stateStartI = 0;
    var i;
    var letter;

    var stateMethods = {
      whitespace: function() {
        if (Logo.WHITESPACE.test(letter))
          return;
        if (Logo.LITERALS.test(letter))
          return setState('characterSymbol');
        if (letter == ';')
          return setState('comment');
        setState('word');
      },
      word: function() {
        if (Logo.WHITESPACE.test(letter))
          return setState('whitespace');
        if (Logo.LITERALS.test(letter))
          return setState('characterSymbol');
        if (letter == ';')
          return setState('comment');
      },
      comment: function() {
        if (letter == '\n')
          setState('whitespace');
      },
      characterSymbol: function() {
        setState('whitespace');
        this.whitespace();
      }
    };

    function setState(name) {
      if (state != name) {
        if (i > stateStartI)
          tokens.push({
            id: tokens.length,
            name: state,
            value: str.slice(stateStartI, i),
            start: stateStartI,
            end: i,
            messages: [],
            tags: []
          });
        state = name;
        stateStartI = i;
      }
    }

    for (i = 0; i < str.length; i++) {
      letter = str[i];      
      stateMethods[state]();
    }

    setState(null);
    
    return tokens;
  },
  parse: function Logo_parse(tokens) {
    function stripWhitespaceAndComments(tokens) {
      var newTokens = [];
      tokens.forEach(function(token) {
        if (token.name != 'whitespace' && token.name != 'comment')
          newTokens.push(token);
      });
      
      newTokens.push({
        name: 'end-of-file',
        value: null,
        tags: []
      });

      return newTokens;
    }

    function parse(tokens) {
      var vocabulary = {
        fd: {
          args: [":amount"]
        },
        rt: {
          args: [":amount"]
        }
      };
      var keywords = {
        repeat: function() {
          var repeat = {
            times: null,
            start: token,
            statements: []
          };
          token.tags.push("control-structure");
          advance();
          if (token.name == "word") {
            repeat.times = token;
            advance();
            if (token.name == "characterSymbol" &&
                token.value == "[") {
              var startBracket = token;
              advance();
              processStatementList({
                statements: repeat.statements,
                start: startBracket,
                name: "repeat block",
                until: {name: "characterSymbol", value: "]"},
              });
            } else
              error({type: "unexpected-token",
                     message: "I expected a [ here."});
          } else
            error({type: "unexpected-token",
                   message: "I expected a word indicating " +
                            "the number of times to repeat here."});
          return repeat;
        },
        to: function() {
          var defn = {
            type: 'definition',
            start: token,
            word: null,
            args: [],
            statements: []
          };
          token.tags.push("definition");
          advance();
          if (token.name == "word") {
            token.tags.push("defined-word");
            defn.word = token;
            // TODO: Ensure there's no namespace conflicts.
            advance();
            while (token.name == "word" &&
                   token.value[0] == ":") {
              token.tags.push("argument-name");
              defn.args.push(token);
              advance();
            }
            processStatementList({
              statements: defn.statements,
              start: defn.start,
              name: "definition",
              until: {name: "word", value: "end"},
            });
          } else
            error({type: "unexpected-token",
                   message: "I was expecting the name of a new word " +
                            "to define."});
          return defn;
        }
      };
      var i = 0;
      var token = tokens[i];
      var errorsFound = false;

      function advance() {
        i++;
        if (i < tokens.length)
          token = tokens[i];
      }

      function eof() {
        return (token.name == 'end-of-file');
      }

      function error(options) {
        if (!errorsFound) {
          errorsFound = true;
          var errorToken = token;
          if (eof() && options.fallback)
            errorToken = options.fallback;
          errorToken.messages.push(options.message);
          errorToken.tags.push("fatal");
          errorToken.tags.push(options.type);
        }
      }

      function processStatement() {
        var statement = null;
        
        if (eof())
          return statement;
        
        if (token.name == 'word') {
          if (token.value in keywords) {
            statement = keywords[token.value]();
          } else if (token.value in vocabulary) {
            statement = {
              name: token.value,
              type: 'call',
              start: token,
              args: []
            };
            token.tags.push("function-call");
            vocabulary[token.value].args.forEach(function(arg) {
              if (errorsFound)
                return;
              advance();
              if (token.name == "word") {
                token.tags.push("argument");
                statement.args.push(token);
              } else
                error({type: "unexpected-token",
                       fallback: statement.start,
                       message: "I was expecting a value for " +
                                arg + " for " + statement.name + "."});
            });
          } else
            error({type: "unknown-name",
                   message: "I have no idea what this word means."});
        } else
          error({type: "unexpected-token",
                 message: "I was expecting a word, but got this instead."});
        return statement;
      }

      function processStatementList(options) {
        var until = options.until;
        var statements = options.statements;
        var name = options.name;
        var start = options.start;

        if (!until)
          until = {name: 'end-of-file', value: null};

        while (!(token.name == until.name &&
                 token.value == until.value) &&
               !eof()) {
          var statement = processStatement();
          if (!statement)
            return;
          statements.push(statement);
          advance();
        }
        if (eof() && until.name != 'end-of-file')
          error({type: "end-not-found",
                 fallback: start,
                 message: "I couldn't find the end of this " +
                          name + "."});
      }

      var program = {
        statements: []
      };

      processStatementList({statements: program.statements});

      while (!eof()) {
        token.tags.push("unparsed");
        advance();
      }

      program.errorsFound = errorsFound;
      return program;
    }

    return parse(stripWhitespaceAndComments(tokens));
  }
};
