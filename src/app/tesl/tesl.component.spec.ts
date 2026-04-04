import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TeslComponent } from './tesl.component';

describe('TeslComponent', () => {
  let component: TeslComponent;
  let fixture: ComponentFixture<TeslComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ TeslComponent ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TeslComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
