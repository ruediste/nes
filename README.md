# Numeric Equation Solver (NES)

[![Deploy to GitHub Pages](https://github.com/ruediste/nes/actions/workflows/gh-pages.yml/badge.svg)](https://github.com/ruediste/nes/actions/workflows/gh-pages.yml)

Working with equations and tired of solving it various variables?
NES is a numerical equation solver geared towards electronic circuit design and physics in general. It allows you to quickly switch the known variables and solve for the unknowns.

[Try it in your Browser](https://ruediste.github.io/nes/)

## Simple Example

Let's take the uniform acceleration as an example:
$$s(t)=s_0+v_0t+\frac{1}{2}at^2$$

We want to know the distance $s$ after 1 second. Translated to the NES language:

    var s=1[m];
    lvar s0=0 [m];
    lvar t=1[s];
    lvar v0=0 [m/s];
    lvar a=9.81 [m/s2];

    s=s0+v0*t+0.5*a*t*t;

`var` is an unknown variable, `lvar` is a locked or known variable. Put units in square brackets. The rest follows more or less the conventions of the C language family.

Open NES in your browser, paste the code into the editor and hit calculate. The result is written back to the editor and you get

    var s=4.904999999999745[m];

Thus far, nothing we could not easily do with a calculator. But how long does it take for 6 meters? Just change

    lvar s=6[m];
    var t=1[s];

Hit calculate and get

    var t=1.106002527218662[s];

Another question: I want to go 6m in 0.9s. What needs to be the initial speed? Solution

    lvar s=6[m];
    lvar s0=0 k[Hz];
    lvar t=0.9 [s];
    var v0=2.252166666666666 [m/s];
    lvar a=9.81 [m/s2];

    s=s0+v0*t+0.5*a*t*t;

## Si Prefixes

Want to know how far you fall in 50ms?

    var s=12 c[m];
    lvar t=2.3 [s];
    lvar v0=3.51 [m/s];
    lvar a=6.28 [m/s2];

    s=v0*t+0.5*a*t*t;

Notice the `c` prefix for `s` and the `m` prefix for the time. You can use the following prefixes: `"" | "T" | "G" | "M" | "k" | "h" | "%" | "d" | "c" | "m" | "u" | "n" | "p"`

# Declaring Equations

Solve the following exercise: A Body is uniformly accelerated. After 2.2s it traveled 24m, after 3s it traveled 40m. What is the initial speed $v_0$ and the acceleration $a$?

Solution:

    var v0=4.242424242424237 [m/s];
    var a=6.060606060606065 [m/s2];

    accel(2.2[s], 24[m]);
    accel(3[s], 40[m]);

    eq accel(t,s){
      s=v0*t+0.5*a*t*t;
    }

You can also use named arguments:

    accel(s:24[m], t:2.2[s]);
