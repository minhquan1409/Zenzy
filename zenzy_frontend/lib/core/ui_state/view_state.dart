import 'package:flutter/widgets.dart';

/// Nguồn dữ liệu đang hiển thị.
enum DataSource { sample, api }

/// ViewModel tải một khối dữ liệu: hiện ngay dữ liệu mẫu (đúng thiết kế), rồi thay bằng dữ liệu từ API.
/// Nếu API lỗi thì giữ dữ liệu mẫu và ghi lại [error].
class LoadViewModel<T> extends ChangeNotifier {
  LoadViewModel(this._load, T initial) : _data = initial {
    refresh();
  }

  final Future<T> Function() _load;
  T _data;
  DataSource source = DataSource.sample;
  Object? error;
  bool _disposed = false;

  T get data => _data;

  Future<void> refresh() async {
    try {
      final value = await _load();
      if (_disposed) return;
      _data = value;
      source = DataSource.api;
      error = null;
    } catch (e) {
      debugPrint('Không tải được dữ liệu từ API, dùng dữ liệu mẫu: $e');
      if (_disposed) return;
      error = e;
    }
    notifyListeners();
  }

  void update(T value) {
    _data = value;
    notifyListeners();
  }

  @override
  void dispose() {
    _disposed = true;
    super.dispose();
  }
}

/// Dựng UI từ một [LoadViewModel] tạo tại chỗ.
class Loader<T> extends StatefulWidget {
  const Loader({super.key, required this.load, required this.initial, required this.builder});
  final Future<T> Function() load;
  final T initial;
  final Widget Function(BuildContext context, LoadViewModel<T> vm) builder;

  @override
  State<Loader<T>> createState() => _LoaderState<T>();
}

class _LoaderState<T> extends State<Loader<T>> {
  late final LoadViewModel<T> _vm = LoadViewModel<T>(widget.load, widget.initial);

  @override
  void dispose() {
    _vm.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => ListenableBuilder(listenable: _vm, builder: (context, _) => widget.builder(context, _vm));
}
