<img src="docs/logo.svg" alt="Quanta logo" width="96" height="96" align="right">

# Quanta

**Streaming statistics for Python, with a Rust core.** Quanta computes means, variances, quantiles and moving averages over data that is too big, too fast or too endless to fit in memory, one value at a time, in constant space.

![PyPI](https://img.shields.io/badge/pypi-1.4.0-3775A9?logo=pypi&logoColor=white) ![Python](https://img.shields.io/badge/python-3.10%20%7C%203.11%20%7C%203.12%20%7C%203.13-3776AB?logo=python&logoColor=white) ![Rust core](https://img.shields.io/badge/core-Rust-000000?logo=rust&logoColor=white) ![Coverage](https://img.shields.io/badge/coverage-98%25-22C55E) ![Licence](https://img.shields.io/badge/licence-Apache%202.0-0EA5E9)

## Installation

```bash
pip install quanta
```

Wheels are published for Linux, macOS and Windows on x86-64 and ARM64. To build from source you need a Rust toolchain:

```shell
git clone https://github.com/quanta-stats/quanta.git && cd quanta
pip install maturin
maturin develop --release
```

## Quick start

```python title="examples/quickstart.py"
import quanta as q

stats = q.Summary()            # mean, variance, min, max
p = q.Quantiles([0.5, 0.95, 0.99], error=0.001)
ewma = q.EWMA(alpha=0.1)

for latency_ms in read_latencies("requests.log"):
    stats.push(latency_ms)
    p.push(latency_ms)
    ewma.push(latency_ms)

print(f"mean={stats.mean:.2f} sd={stats.std:.2f}")
print(f"p99={p[0.99]:.1f} ms, trend={ewma.value:.1f} ms")
```

Every estimator can be serialised, merged and resumed, so you can compute statistics in parallel and combine the results:

```json
{
  "kind": "summary",
  "count": 1048576,
  "mean": 41.87,
  "m2": 2395511.4,
  "min": 0.8,
  "max": 912.3
}
```

## How it works

Quanta never stores your data. Each estimator keeps a handful of numbers and updates them as values arrive.

### Mean and variance

The running mean and variance use Welford's algorithm[^welford], which stays numerically stable where the textbook formula $\sigma^2 = E[x^2] - E[x]^2$ loses precision:

$$
\begin{aligned}
\delta_n &= x_n - \bar{x}_{n-1} \\
\bar{x}_n &= \bar{x}_{n-1} + \frac{\delta_n}{n} \\
M_{2,n} &= M_{2,n-1} + \delta_n \left(x_n - \bar{x}_n\right)
\end{aligned}
$$

The sample variance is then $s^2 = M_{2,n} / (n - 1)$.

### Moving averages

An exponentially weighted moving average with smoothing factor $\alpha \in (0, 1]$ is

$$
S_t = \alpha\, x_t + (1 - \alpha)\, S_{t-1}
$$

so the weight of an observation $k$ steps in the past decays as $\alpha (1-\alpha)^k$.

### Quantiles

Quantiles use a KLL sketch[^kll]. For a stream of $n$ values and a target rank error $\varepsilon$, the sketch needs only

$$
O\!\left(\frac{1}{\varepsilon}\log\log\frac{1}{\delta}\right)
$$

words of memory to answer any quantile within $\pm\varepsilon n$ ranks with probability $1 - \delta$.

> Streaming algorithms trade a little accuracy for a lot of memory. Quanta lets you choose exactly how much.

## Configuration

Defaults can be set in a `quanta.yaml` file next to your project:

```yaml title="quanta.yaml"
quantiles:
  error: 0.001          # target rank error (epsilon)
  seed: 42              # reproducible sketches
ewma:
  alpha: 0.05
threads: auto           # or a number
```

## API reference

| Class                  | Constructor                              | Key members                          |
| :--------------------- | :--------------------------------------- | :----------------------------------- |
| `Summary`              | `Summary()`                              | `count`, `mean`, `var`, `std`, `min`, `max` |
| `Quantiles`            | `Quantiles(qs, error=0.01, seed=None)`   | `q[0.5]`, `cdf(x)`, `merge(other)`   |
| `EWMA`                 | `EWMA(alpha)`                            | `value`, `reset()`                   |
| `Histogram`            | `Histogram(bins, range)`                 | `counts`, `edges`, `to_numpy()`      |
| `Window`               | `Window(size, stat="mean")`              | `value`, `full`                      |

### `Quantiles.merge`

Combines two sketches built over different parts of a stream.

#### Parameters

- **other** (`Quantiles`): a sketch created with the same `qs` and `error`.

#### Returns

A new `Quantiles` instance. Neither input is modified.

##### Complexity

$O(k \log k)$ time, where $k$ is the number of retained items.

###### Available since 0.9

## Benchmarks

Summarising 100 million `float64` values on an 8-core laptop[^bench]:

![Throughput in millions of values per second: pure Python 4, vectorised baseline 180, Quanta single thread 420, Quanta eight threads 2,900](docs/benchmark.svg "Throughput on 100 million values (higher is better)")

| Implementation              | Time (s) | Throughput (M values/s) | Peak memory |
| :-------------------------- | -------: | ----------------------: | ----------: |
| Pure Python loop            |   24.80 |                       4 |       12 MB |
| Vectorised baseline         |    0.56 |                     180 |      800 MB |
| Quanta, 1 thread            |    0.24 |                     420 |      1.2 MB |
| **Quanta, 8 threads**       | **0.034** |               **2 900** |  **1.4 MB** |

The Rust core is a small, dependency-free crate you can also use on its own:

```rust title="core/src/summary.rs"
#[derive(Clone, Default)]
pub struct Summary { n: u64, mean: f64, m2: f64 }

impl Summary {
    pub fn push(&mut self, x: f64) {
        self.n += 1;
        let delta = x - self.mean;
        self.mean += delta / self.n as f64;
        self.m2 += delta * (x - self.mean);
    }

    pub fn variance(&self) -> Option<f64> {
        (self.n > 1).then(|| self.m2 / (self.n - 1) as f64)
    }
}
```

## Changelog

### 1.4.0 (2026-08-12)

- Added `Histogram.to_numpy()` for zero-copy export
- Added Python 3.13 wheels, including free-threaded builds
- `Quantiles.merge` is now 40% faster on large sketches
- Fixed a rare overflow in `Window` with more than 2³² items

### 1.3.0 (2026-05-02)

- New `Window` estimator for fixed-size sliding windows
- `EWMA` accepts a `halflife` instead of `alpha`
- Fixed `Summary.std` returning `nan` for a single value (now `None`)

### 1.2.0 (2026-01-08)

- Estimators can be pickled and sent between processes
- New `quanta.yaml` configuration file
- Dropped support for Python 3.9

### 1.1.0 (2025-10-21)

- Added ARM64 wheels for Linux and Windows
- `Quantiles.cdf(x)` estimates the rank of any value
- Reduced the memory used by `Quantiles` by 30%

### 1.0.0 (2025-07-30)

- First stable release: the public API is now covered by semantic versioning
- Complete type hints and a `py.typed` marker
- New documentation site with runnable examples

### 0.9.0 (2025-05-14)

- Added `Quantiles.merge`
- Deterministic sketches with the `seed` argument

### 0.5.0 (2025-01-20)

- Rewrote the core in Rust; up to 100× faster than 0.4

### 0.1.0 (2024-09-02)

- Initial release with `Summary` and `EWMA`

## Licence

Quanta is released under the Apache Licence 2.0. © 2026 The Quanta authors.

[^welford]: B. P. Welford, "Note on a method for calculating corrected sums of squares and products", *Technometrics* 4(3), 1962.
[^kll]: Z. Karnin, K. Lang and E. Liberty, "Optimal quantile approximation in streams", *FOCS* 2016.
[^bench]: AMD Ryzen 7 7840U, 32 GB RAM, Python 3.12, median of five runs. Numbers are illustrative.
