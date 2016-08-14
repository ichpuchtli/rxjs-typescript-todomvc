///<reference path="rx.all.d.ts" />

namespace App {

	'use strict';

	declare var Router: (any) => any;

	export interface Todo {
		id?: number;

		title?: string;

		complete?: boolean;
	}

	// use a sparse array similar to an object with numeric keys
	type TodoStore = Todo[]; 

	type TodoTransform = (TodoStore) => TodoStore;

	const ENTER_KEY_CODE = 13;

	const STORE_KEY = 'todos-typescript-rxjs';

	const todoList = document.querySelector('.todo-list') as HTMLElement;
	const todoInput = document.querySelector('.new-todo') as HTMLInputElement;
	const todoCount = document.querySelector('.todo-count');
	const todoMain = document.querySelector('.main') as HTMLElement;
	const todoFooter = document.querySelector('.footer') as HTMLElement;

	const all = document.querySelector('a.all') as HTMLElement;
	const active = document.querySelector('a.active') as HTMLElement;
	const completed = document.querySelector('a.completed') as HTMLElement;

	const hide = (element: HTMLElement) => element.style.display = 'none';
	const show = (element: HTMLElement) => element.style.display = 'block';
	const byId = (id: number | string) => document.getElementById(id.toString());

	function parent(element: HTMLElement): HTMLElement {
		return element.tagName == 'LI' ? element : parent(element.parentElement);
	}

	const clearCompletedBtn = document.querySelector('.clear-completed');

	const deleteTodoDom = (id: number) => byId(id).remove();

	function toArray<T>(arraylike: { length: number, [index: number]: T }) {
		return Array.prototype.slice.call(arraylike) as T[];
	}

	function localTodos() {
		return toArray<Todo>(JSON.parse(localStorage.getItem(STORE_KEY) || '[]'));
	}

	function saveLocally(todoStore: TodoStore) {
		return localStorage.setItem(STORE_KEY, JSON.stringify(todoStore.filter(x => x as any)));
	}

	const toggleSelected = (select: HTMLElement) => {
		all.classList.remove('selected');
		active.classList.remove('selected');
		completed.classList.remove('selected');
		select.classList.add('selected');
	}

	const addTodoDom = (todo: Todo) => {
		const li = document.createElement('li');
		li.id = todo.id.toString();
		li.innerHTML = itemTemplate(todo);
		if (todo.complete) {
			li.classList.add('completed');
		}
		todoList.appendChild(li);
		todoInput.value = '';
		show(todoFooter);
		show(todoMain);
	};

	const editTodoDom = (todo: Todo) => {
		const li = byId(todo.id);
		li.innerHTML = itemTemplate(todo);
		li.classList.remove('editing');
	};

	var edit = ({id, title}: Todo) => (todoStore: TodoStore) => {

		todoStore[id].title = title;

		editTodoDom(todoStore[id]);

		return todoStore;
	};

	var itemTemplate = ({title, complete}: Todo) => `
	<div class="view">
		<input class="toggle" type="checkbox" ${complete && 'checked'}>
		<label>${title}</label>
		<button class="destroy"></button>
	</div>
	<input class="edit" value="${title}">`;

	const routeChanges = new Rx.ReplaySubject<TodoTransform>(1);

	const routes = {
		'/': () => {
			routeChanges.onNext(todoStore => []);
			toggleSelected(all)
		},
		'/active': () => {
			routeChanges.onNext(todoStore => todoStore.filter(todo => todo.complete));
			toggleSelected(active);
		},
		'/completed': () => {
			routeChanges.onNext(todoStore => todoStore.filter(todo => todo && !todo.complete));
			toggleSelected(completed);
		}
	};

	const allEvents = Rx.Observable
		.fromEvent<MouseEvent>(todoList, 'click')
		.map(e => e.target as HTMLElement)
		.share();

	const enterKeyPress = Rx.Observable.fromEvent<KeyboardEvent>(document, 'keyup')
		.filter(x => x.keyCode === ENTER_KEY_CODE)
		.share();

	const clearCompleted = Rx.Observable.fromEvent(clearCompletedBtn, 'click')
		.flatMap(e => Rx.Observable.of(...toArray<Element>(todoList.children)
			.filter(el => el.classList.contains('completed'))
			.map(el => parseInt(el.id))));

	const destroyEvents = allEvents
		.filter(el => el.className === 'destroy')
		.map(element => parseInt(parent(element).id))
		.merge(clearCompleted)
		.do(deleteTodoDom);

	const toggleEvents = allEvents.filter(e => e.className === 'toggle')
		.map((element) => {
			const li = parent(element);
			li.classList.toggle('completed');
			const id = parseInt(li.id);
			return { id };
		});

	const newTodos = enterKeyPress
		.filter(e => {
			return toArray<HTMLLIElement>(todoList.children as any).every(li => !li.classList.contains('editing'));
		})
		.map(e => ({ title: todoInput.value.trim(), complete: false }))
		.filter(todo => todo.title.length > 0);

	var add = ({title, complete}: Todo) => (todoStore: TodoStore) => {

		const uid = todoStore.length;

		todoStore[uid] = { id: uid, title, complete };

		addTodoDom(todoStore[uid]);

		return todoStore;
	};

	var toggle = ({id, complete}: Todo) => (todoStore: TodoStore) => {
		todoStore[id].complete = !todoStore[id].complete;
		return todoStore;
	};

	var remove = (id: number) => (todoStore: TodoStore) => {
		delete todoStore[id];
		return todoStore;
	};

	var intentToEditEvents = allEvents.filter(e => e.tagName == 'LABEL')
		.bufferWithTimeOrCount(500, 2) // dblclick implementation 
		.filter(e => e.length == 2)
		.subscribe(([e1]) => {
			const li = parent(e1);
			li.classList.add('editing');
			(li.querySelector('input.edit') as HTMLInputElement).focus();
		});

	const blur = Rx.Observable.fromEvent<FocusEvent>(todoList, 'focusout')
		.filter(e => (e.target as HTMLInputElement).classList.contains('edit'));

	const edits = enterKeyPress
		.filter(e => toArray(todoList.children).some(el => el.classList.contains('editing')))
		.merge(blur as Rx.Observable<any>)
		.map(() => {
			const li = todoList.querySelector('li.editing');
			const input = li.querySelector('input.edit') as HTMLInputElement;

			return { id: parseInt(li.id), title: input.value.trim() };
		});

	const updateTodoCount = (todoStore: TodoStore) => {
		const length = todoStore.filter(todo => todo && !todo.complete).length;
		todoCount.innerHTML = `<strong>${length}</strong> item${length > 1 ? 's' : ''} left`;
		if(length == 0){
			hide(todoMain);
			hide(todoFooter);
		}
	};

    // merge all actions stream before scanning the action on the todo store
	const todoStoreChanges = newTodos.merge(Rx.Observable.of(...localTodos())).map(add)
		.merge(toggleEvents.map(toggle))
		.merge(destroyEvents.map(remove))
		.merge(edits.map(edit))
		.scan<TodoStore>((todoStore, action) => action(todoStore), [])
		.do(updateTodoCount)
		.share();

    // combine route changes and todoStore changes to hide/show todos
	todoStoreChanges.combineLatest(routeChanges.asObservable(), (todoStore, filter) => filter(todoStore))
		.subscribe(todos => {
			toArray(todoList.children as any as HTMLElement[]).forEach(show);
			toArray(todos.map(todo => byId(todo.id))).forEach(hide);
		});

    // debounce todoStoreChangeStream before persisting to localStorage
	todoStoreChanges
		.debounce(1000)
		.subscribe(saveLocally);

	var router = Router(routes);

	router.init('/');
}