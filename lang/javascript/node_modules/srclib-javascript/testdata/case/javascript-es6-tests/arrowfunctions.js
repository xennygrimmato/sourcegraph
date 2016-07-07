// expression bodies
[].map((v, i) => v + i);


// statement bodies
[].forEach(v => {
    v++;
});

// lexical this
class lexicalthis {
    constructor() {
        this.c = 0;
        setInterval(() => {
            this.c++;
        }, 1000);
    }
}